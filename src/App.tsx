import { useEffect, useState } from 'react';
import { loadProspects } from '@/lib/csvLoader';

export default function App() {
  const [prospects, setProspects] = useState([]);

  useEffect(() => {
    async function load() {
      const rows = await loadProspects();
      setProspects(rows);
    }
    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      {prospects.length === 0 ? (
        <p>Loading real UCC leads…</p>
      ) : (
        prospects.map((p, i) => (
          <div key={i} style={{ background: '#112', color: '#fff', padding: 12, margin: 8, borderRadius: 6 }}>
            <strong>{p['Business Name']}</strong><br />
            {p.City}, {p.State}<br />
            Phone: {p.Phone}<br />
            Email: {p.Email}<br />
            Filing Date: {p['Filing Date']}
          </div>
        ))
      )}
    </div>
  );
}

