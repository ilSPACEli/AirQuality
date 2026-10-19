import MeasurementsManager from '../components/MeasurementsManager.jsx';
import { PM25_LIMIT } from '../utils/format.js';

// Сторінка всіх вимірювань усіх станцій
function MeasurementsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Вимірювання</h1>
          <p className="muted">
            Концентрації забруднювачів, мкг/м³. Рядки, де PM2.5 перевищує {PM25_LIMIT} мкг/м³ (норма ВООЗ),
            виділено. «—» означає, що сенсор не передав значення.
          </p>
        </div>
      </div>
      <MeasurementsManager />
    </>
  );
}

export default MeasurementsPage;
