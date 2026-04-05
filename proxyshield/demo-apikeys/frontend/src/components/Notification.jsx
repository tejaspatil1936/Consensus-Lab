export default function Notification({ message, type, onClose }) {
  const cls = {
    success: 'notif-success',
    error: 'notif-error',
    warning: 'notif-warning',
    info: 'notif-info'
  }[type] || 'notif-info';

  return (
    <div className={`notification ${cls}`} onClick={onClose} style={{ cursor: 'pointer' }}>
      {message}
    </div>
  );
}
