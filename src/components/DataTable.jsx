function DataTable({
  columns,
  data,
  rowKey = row => row.id,
  emptyText = 'Немає даних',
  sort,
  onSortChange,
  rowClassName,
  loading = false
}) {
  const sortField = sort?.replace(/^-/, '');
  const descending = sort?.startsWith('-');

  const handleSort = column => {
    if (!column.sortKey || !onSortChange) return;
    // Повторний клік по тій самій колонці змінює напрямок
    const next =
      sortField === column.sortKey && descending ? column.sortKey : `-${column.sortKey}`;
    onSortChange(next);
  };

  return (
    <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => {
              const sortable = Boolean(column.sortKey && onSortChange);
              const active = sortable && sortField === column.sortKey;
              return (
                <th
                  key={column.key}
                  className={[column.align && `align-${column.align}`, sortable && 'sortable']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSort(column)}
                  aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
                >
                  {column.title}
                  {active && <span className="sort-mark">{descending ? ' ↓' : ' ↑'}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td className="empty" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map(row => (
              <tr key={rowKey(row)} className={rowClassName?.(row)}>
                {columns.map(column => (
                  <td key={column.key} className={column.align && `align-${column.align}`}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
