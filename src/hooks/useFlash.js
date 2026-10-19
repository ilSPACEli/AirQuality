import { useEffect, useState } from 'react';

// Коротке повідомлення про успішну дію, що зникає саме
export function useFlash(timeout = 3000) {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), timeout);
    return () => clearTimeout(timer);
  }, [message, timeout]);

  return [message, setMessage];
}
