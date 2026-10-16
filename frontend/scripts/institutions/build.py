"""Builds frontend/src/content/institutions.json: the directory of universities, colleges and schools by city.

Run from this folder:  python build.py
1. downloads every school, college and university of Kazakhstan, and the cities and towns, from OpenStreetMap
   (Overpass API; the queries are the .overpassql files here) into a temp folder;
2. keeps real schools (no music, sport, driving or language schools, no kindergartens), cleans the names and puts each
   one in the nearest city of src/content/geo.ts;
3. merges the curated list (curated.ts: official names and abbreviations), which wins over the map's spelling.
Data: (c) OpenStreetMap contributors, ODbL.
"""
import json, math, re, collections, os, tempfile, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(tempfile.gettempdir(), 'debatekz-institutions')
os.makedirs(D, exist_ok=True)
GEO = os.path.join(HERE, '../../src/content/geo.ts')
F = os.path.join(HERE, '../../src/content')


def fetch(query_file, out):
    path = os.path.join(D, out)
    if not os.path.exists(path):
        q = open(os.path.join(HERE, query_file), encoding='utf-8').read()
        req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode(),
                                     headers={'User-Agent': 'DebateKZ-directory/1.0', 'Accept': 'application/json'})
        open(path, 'wb').write(urllib.request.urlopen(req, timeout=300).read())
    return json.load(open(path, encoding='utf-8'))['elements']


edu = fetch('query-institutions.overpassql', 'osm_edu.json')
places = fetch('query-places.overpassql', 'osm_places.json')

# our cities (ru, kz) from geo.ts
geo = open(GEO, encoding='utf-8').read()
cities = []
for block in re.findall(r"cities: \[(.*?)\]", geo, flags=re.S):
    for m in re.finditer(r"n\('([^']+)'(?:, '([^']+)')?\)", block):
        cities.append((m.group(1), m.group(2) or m.group(1)))

def key(s):
    return re.sub(r'[^a-zа-яёәғқңөұүһі]', '', s.lower().replace('ё', 'е'))

coords = {}
for p in places:
    t = p['tags']
    names = {key(t.get(k, '')) for k in ('name', 'name:ru', 'name:kk', 'name:kz', 'old_name', 'alt_name') if t.get(k)}
    for ru, kz in cities:
        if key(ru) in names or key(kz) in names:
            # several nodes with one name: keep the bigger place (city over town)
            if ru not in coords or t.get('place') == 'city':
                coords[ru] = (p['lat'], p['lon'], t.get('place'))
missing = [ru for ru, _ in cities if ru not in coords]

def dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

BIG = {'Астана': 28, 'Алматы': 30, 'Шымкент': 22}

# names that are not schools for debaters: music/art/sport/driving/language schools, kindergartens, courses
SKIP = re.compile(r'музык|художеств|искусств|спортив|детско-юношеск|ДЮСШ|автошкол|вождени|танц|хореограф|языков[а-я]* (школ|центр)|курс|детский сад|балабақша|бөбекжай|кружк|творчеств|воскресн|\bmusic\b|art school|sport|dance|driving|kindergarten|language|English|шахмат|плаван|футбол|бокс|борьб|каратэ|гимнастик|теннис|хоккей|шахмат', re.I)
LEGAL = re.compile(r'^(?:(?:КГУ|ГУ|КГКП|ГККП|РГКП|РГП|ГКП|НАО|АО|ТОО|ЧУ|УО|КММ|МКҚК|ЖШС|РМК|РМҚК|КМҚК|ЧОУ|НУ|КГП|МКК)\s+)+', re.I)

def clean(n):
    n = n.strip().strip('"').strip()
    n = LEGAL.sub('', n)
    n = re.sub(r'^[«"]\s*(.*?)\s*[»"]\s*$', r'\1', n)
    n = n.replace('""', '"').replace('« ', '«').replace(' »', '»')
    n = re.sub(r'\s+', ' ', n).strip(' ,.-')
    n = re.sub(r'№\s*', '№', n)
    return n

KIND = {'school': 'school', 'college': 'college', 'university': 'university'}
rows, skipped, unplaced = [], collections.Counter(), 0
for e in edu:
    t = e['tags']
    raw = t.get('name:ru') or t.get('name')
    if not raw:
        continue
    if SKIP.search(raw) or SKIP.search(t.get('name', '')):
        skipped['kind'] += 1
        continue
    name = clean(raw)
    if len(name) < 4 or not re.search(r'[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]', name):
        skipped['short'] += 1
        continue
    # a bare "Школа" or "Колледж" is no name at all
    if re.fullmatch(r'(?i)(школа|мектеп|колледж|университет|лицей|гимназия|school|college|university)', name):
        skipped['generic'] += 1
        continue
    pt = (e.get('lat') or e['center']['lat'], e.get('lon') or e['center']['lon'])
    best, bd = None, 1e9
    for ru, c in coords.items():
        d = dist(pt, c)
        if d < bd:
            best, bd = ru, d
    limit = BIG.get(best, 12 if coords.get(best, (0, 0, 'town'))[2] == 'city' else 7)
    if bd > limit:
        unplaced += 1
        continue
    rows.append({'name': name, 'city': best, 'kind': KIND[t['amenity']], 'kz': clean(t['name:kk']) if t.get('name:kk') and t.get('name:kk') != raw else None})

# one entry per name within a city (buildings of one school are mapped twice)
seen, out = set(), []
for r in rows:
    k = (r['city'], key(r['name']))
    if k in seen:
        continue
    seen.add(k)
    out.append(r)
out.sort(key=lambda r: (r['city'], {'university': 0, 'college': 1, 'school': 2}[r['kind']], r['name']))
osm = [{'name': r['name'], 'city': r['city'], 'kind': r['kind']} for r in out]

# ---- merge with the curated list ----

# ---- the curated list (official names, abbreviations to search by) ----
src = open(os.path.join(HERE, 'curated.ts'), encoding='utf-8').read()
curated = []
for kind, city, name, kw in re.findall(r"\b([us])\('([^']+)', '([^']+)'(?:, '([^']*)')?\)", src):
    curated.append({'n': name, 'c': city, 'k': 'university' if kind == 'u' else 'school', 'w': kw})
m = re.search(r"\.\.\.\[(.*?)\]\s*\.map\(city => s\(city, `Назарбаев Интеллектуальная школа г\. \$\{city\}`, 'НИШ NIS'\)\)", src, flags=re.S)
for city in re.findall(r"'([^']+)'", m.group(1)):
    curated.append({'n': f'Назарбаев Интеллектуальная школа г. {city}', 'c': city, 'k': 'school', 'w': 'НИШ NIS'})
print('curated', len(curated))

# ---- cleaning the map's names ----
DROP = re.compile(r'(?i)^(им\.?\s|имени\s)|учебный корпус|^корпус|военная кафедра|факультет|кафедра|бэби|дошкольн|детская академия|спорткомплекс|центр немецкого|школа сад|школа-сад|с нарушени|для детей с|коррекцион|авиационный учебный центр|учебно-научно|^средняя школа$|^школа$|^общеобразовательная школа$|virere|центр образования взрослых|вечерн')
BUILDING = re.compile(r'(?i)\s*[,(]?\s*(главный|новый|старый)?\s*(учебный\s+)?корпус\s*(№\s*\d+|\d+)?\s*\)?\s*$|\s+новый корпус$')

def fix_quotes(n):
    n = re.sub(r'"([^"]+)"', r'«\1»', n)
    if n.count('"') == 1:  # a name cut after the opening quote: «Дарын
        n = n.replace('"', '«') + '»'
    if n.count('«') > n.count('»'):
        n += '»'
    return n

def stem(w):
    return w[:5]

def words(n):
    return {stem(w) for w in re.findall(r'[a-zа-яёәғқңөұүһі0-9]+', n.lower().replace('ё', 'е')) if len(w) > 2 and w not in ('имени', 'им', 'университет', 'школа', 'колледж')}

def key(n):
    return re.sub(r'[^a-zа-яёәғқңөұүһі0-9]', '', n.lower().replace('ё', 'е'))

# other spellings of curated entries that the word match does not catch
SAME_AS_CURATED = {'Казахстанский филиал московского государственного университета имени М. В. Ломоносова', 'Өнер Университеті'}

rows = []
for r in osm:
    n = r['name']
    if DROP.search(n):
        continue
    n = BUILDING.sub('', n).strip(' ,')
    n = fix_quotes(n)
    if len(n) < 4:
        continue
    # the first letter up ("школа-лицей Binom School" -> "Школа-лицей …")
    n = n[0].upper() + n[1:]
    # a network school without its city: name the city, so two cities' schools do not look the same
    if re.fullmatch(r'(?i)назарбаев интеллектуальная школа.*', n) and ' г.' not in n:
        n = f'{n} г. {r["city"]}'
    if n in SAME_AS_CURATED:
        continue
    kind = r['kind']
    # the map sometimes tags a lyceum or a school as a college: the name decides
    if kind == 'college' and re.search(r'(?i)школ|лицей|гимнази|мектеп', n) and not re.search(r'(?i)колледж|профессиональн|проф', n):
        kind = 'school'
    rows.append({'n': n, 'c': r['city'], 'k': kind, 'w': ''})

# the curated name wins over the map's spelling of the same place (same city, mostly the same words)
out = list(curated)
for r in rows:
    same = [c for c in curated if c['c'] == r['c'] and c['k'] == r['k']]
    rw = words(r['n'])
    dup = False
    for c in same:
        cw = words(c['n']) | {stem(x) for x in c['w'].lower().split()}
        if rw and len(rw & cw) / len(rw) >= 0.6:
            dup = True
            break
        if key(r['n']) in {key(x) for x in c['w'].split()}:
            dup = True
            break
    if not dup:
        out.append(r)

# one entry per name within a city
seen, final = set(), []
for r in out:
    k = (r['c'], key(r['n']))
    if k in seen:
        continue
    seen.add(k)
    final.append(r)
order = {'university': 0, 'college': 1, 'school': 2}
final.sort(key=lambda r: (r['c'], order[r['k']], r['n'].lower()))
# compact: name, city, kind (u/c/s), search words
data = [[r['n'], r['c'], r['k'][0]] + ([r['w']] if r['w'] else []) for r in final]
json.dump(data, open(os.path.join(F, 'institutions.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('final', len(final), collections.Counter(r['k'] for r in final))
