// Робочі одиниці роботи: усі концентрації в мкг/м³, CO – в мг/м³
export const UNITS = {
  pm25: 'мкг/м³',
  pm10: 'мкг/м³',
  no2: 'мкг/м³',
  so2: 'мкг/м³',
  o3: 'мкг/м³',
  co: 'мг/м³'
};

export const MOLAR_VOLUME = 24.45;

export const MOLAR_MASS = { no2: 46.0055, so2: 64.066, o3: 47.997, co: 28.01 };

export const ppbToUgm3 = (ppb, molarMass) => (ppb * molarMass) / MOLAR_VOLUME;


export const ugm3ToPpb = (ugm3, molarMass) => (ugm3 * MOLAR_VOLUME) / molarMass;

export const mgm3ToPpm = (mgm3, molarMass) => (mgm3 * MOLAR_VOLUME) / molarMass;

export const ugToMg = ugm3 => ugm3 / 1000;
export const mgToUg = mgm3 => mgm3 * 1000;

export function toWorkingUnit(pollutant, value, unit) {
  if (value === null || value === undefined) return null;
  const isCo = pollutant === 'co';
  switch (unit) {
    case 'ugm3':
      return isCo ? ugToMg(value) : value;
    case 'mgm3':
      return isCo ? value : mgToUg(value);
    case 'ppb': {
      const ug = ppbToUgm3(value, MOLAR_MASS[pollutant]);
      return isCo ? ugToMg(ug) : ug;
    }
    default:
      throw new Error(`Невідома одиниця: ${unit}`);
  }
}
