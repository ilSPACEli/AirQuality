// Стани завантаження та помилки, спільні для всіх сторінок
export function Loader({ text = 'Завантаження…' }) {
  return (
    <div className="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

export function Flash({ message }) {
  if (!message) return null;
  return (
    <div className="flash" role="status">
      {message}
    </div>
  );
}

export function ErrorMessage({ message, onRetry }) {
  return (
    <div className="status status-error" role="alert">
      <span>Помилка: {message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Спробувати ще раз
        </button>
      )}
    </div>
  );
}
