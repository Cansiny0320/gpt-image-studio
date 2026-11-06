import { useEffect, useState } from 'react';
export function LocalImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    // Object URLs are external resources; synchronize and revoke them with the Blob lifetime.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
