// Станції для seed і генератора річного ряду.
// population – чисельність наявного населення міста на 01.01.2022 (Держстат),
// settlement_type – тип населеного пункту
export const STATIONS = [
  { code: 'KYIV-01', name: 'Київ, вул. Хрещатик', city: 'Kyiv', latitude: 50.4501, longitude: 30.5234, population: 2952301 },
  { code: 'KYIV-02', name: 'Київ, Оболонь', city: 'Kyiv', latitude: 50.5013, longitude: 30.4982, population: 2952301 },
  { code: 'LVIV-01', name: 'Львів, пл. Ринок', city: 'Lviv', latitude: 49.8419, longitude: 24.0315, population: 717273 },
  { code: 'KHARKIV-01', name: 'Харків, майдан Свободи', city: 'Kharkiv', latitude: 50.0045, longitude: 36.2312, population: 1421125 },
  { code: 'ODESA-01', name: 'Одеса, Приморський бульвар', city: 'Odesa', latitude: 46.4857, longitude: 30.7438, population: 1010537 },
  { code: 'DNIPRO-01', name: 'Дніпро, просп. Яворницького', city: 'Dnipro', latitude: 48.4647, longitude: 35.0462, population: 968502 },
  { code: 'ZAPORIZHZHIA-01', name: 'Запоріжжя, просп. Соборний', city: 'Zaporizhzhia', latitude: 47.8388, longitude: 35.1396, population: 710052 },
  { code: 'VINNYTSIA-01', name: 'Вінниця, вул. Соборна', city: 'Vinnytsia', latitude: 49.2331, longitude: 28.4682, population: 369739 },
  { code: 'IF-01', name: 'Івано-Франківськ, вул. Незалежності', city: 'Ivano-Frankivsk', latitude: 48.9226, longitude: 24.7111, population: 238196 },
  { code: 'CHERNIHIV-01', name: 'Чернігів, Красна площа', city: 'Chernihiv', latitude: 51.4982, longitude: 31.2893, population: 282747 }
].map(station => ({
  ...station,
  settlement_type: 'city',
  measurement_types: ['pm25', 'pm10', 'no2', 'temperature', 'humidity']
}));
