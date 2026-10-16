[out:json][timeout:120];
area["ISO3166-1"="KZ"][admin_level=2]->.kz;
node["place"~"^(city|town)$"](area.kz);
out;
