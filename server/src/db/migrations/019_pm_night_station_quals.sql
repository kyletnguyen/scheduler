-- PM/Night staff cover all bench stations since only 1-3 people work those shifts.
-- Add all bench station qualifications for PM CLS (John), PM MLT (Niko),
-- and Night CLS (Denise, Jenissa, Leo).
-- Bench stations: Hematology/UA(1), Chemistry(2), Microbiology(3), Blood Bank(4)

-- John (id=6, PM CLS)
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (6, 1);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (6, 2);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (6, 3);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (6, 4);

-- Niko (id=19, PM MLT)
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (19, 1);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (19, 2);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (19, 3);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (19, 4);

-- Denise (id=22, Night CLS)
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (22, 1);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (22, 2);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (22, 3);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (22, 4);

-- Jenissa (id=23, Night CLS)
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (23, 1);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (23, 2);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (23, 3);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (23, 4);

-- Leo (id=24, Night CLS)
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (24, 1);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (24, 2);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (24, 3);
INSERT OR IGNORE INTO employee_stations (employee_id, station_id) VALUES (24, 4);
