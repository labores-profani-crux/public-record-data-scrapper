// src/lib/mockData.ts
import Papa from 'papaparse'

export async function loadProspects() {
  const res = await fetch('/ucc_enriched.csv')
  const csvText = await res.text()

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  // Map CSV → Prospect shape expected by UI
  return parsed.data.map((row, index) => ({
    id: index + 1,
    companyName: row['Business Name'] || '',
    city: row['City'] || '',
    state: row['State'] || '',
    zipCode: row['Zip Code'] || '',
    phone: row['Phone'] || '',
    email: row['Email'] || '',
    ownerName: row['Owner Name'] || '',
    filingDate: row['Filing Date'] || '',
    lienNumber: row['Lien Number'] || '',
    fileType: row['File Type'] || '',
    lienType: row['Lien Type'] || '',

    // Minimal fields so UI stops crashing
    industry: row['Industry'] || 'General',
    healthScore: 80,
    growthSignals: 0,
    priorityScore: 100,
    claimed: false,
  }))
}

