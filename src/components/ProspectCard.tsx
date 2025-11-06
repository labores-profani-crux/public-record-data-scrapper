import React from 'react';

function ProspectCard({ data }) {
  return (
    <div className="prospect-card">
      <div className="pc-title">
        <h3>{data.companyName}</h3>
        <span className="pc-score">100</span>
      </div>

      <div className="pc-section">
        <strong>Owner:</strong> {data.owner || 'N/A'}
      </div>

      <div className="pc-section">
        <strong>Phone:</strong> {data.phone || 'N/A'}
      </div>

      <div className="pc-section">
        <strong>Email:</strong> {data.email || 'N/A'}
      </div>

      <div className="pc-section">
        <strong>Address:</strong>  
        {data.address1}, {data.city}, {data.state} {data.zip}
      </div>

      <div className="pc-section">
        <strong>Filing Date:</strong> {data.filingDate}
      </div>

      <div className="pc-section">
        <strong>Lien Type:</strong> {data.lienType}
      </div>

      <div className="pc-section">
        <strong>File Type:</strong> {data.fileType}
      </div>

      <button className="btn-details">
        View Details
      </button>
    </div>
  );
}

export default ProspectCard;

