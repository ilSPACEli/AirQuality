// Пагінація за meta з бекенду: { total, page, limit, pages }
function Pagination({ meta, onPageChange }) {
  if (!meta || !meta.total) return null;

  const { total, page, limit, pages } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="pagination">
      <span className="muted">
        {from}–{to} з {total}
      </span>
      <div className="pagination-buttons">
        <button className="btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Назад
        </button>
        <span>
          Сторінка {page} з {pages}
        </span>
        <button className="btn" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Далі →
        </button>
      </div>
    </div>
  );
}

export default Pagination;
