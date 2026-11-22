// Паспорт розрахунку: метод, вхідні дані, коефіцієнти, версія довідника.
// За ним розрахунок можна повторити вручну
function Passport({ passport, children }) {
  if (!passport) return null;
  return (
    <section className="card passport">
      <h2>Паспорт розрахунку</h2>
      {children}
      <details>
        <summary>Повний паспорт (JSON)</summary>
        <pre className="mono">{JSON.stringify(passport, null, 2)}</pre>
      </details>
    </section>
  );
}

export default Passport;
