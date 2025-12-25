import './Pagination.css';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, totalPages, onPageChange, disabled }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        onClick={() => onPageChange(0)}
        disabled={page === 0 || disabled}
      >
        First
      </button>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0 || disabled}
      >
        Previous
      </button>
      <span className="text-pixel text-muted">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1 || disabled}
      >
        Next
      </button>
      <button
        onClick={() => onPageChange(totalPages - 1)}
        disabled={page >= totalPages - 1 || disabled}
      >
        Last
      </button>
    </div>
  );
}
