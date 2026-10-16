[out:json][timeout:180];
area["ISO3166-1"="KZ"][admin_level=2]->.kz;
(
  nwr["amenity"~"^(school|college|university)$"]["name"](area.kz);
);
out center tags;
