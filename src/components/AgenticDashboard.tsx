import { useEffect, useState } from 'react';
import { loadProspects } from '@/lib/csvLoader';

export default function AgenticDashboard() {
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
      {prospects.map((p, i) => (
        <div key={i} style={{ color: '#fff' }}>
          {p['Business Name']} – {p.City}, {p.State}
        </div>
      ))}
    </div>
  );
}

