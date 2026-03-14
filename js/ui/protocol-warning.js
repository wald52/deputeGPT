export function showLocalProtocolWarning() {
  if (window.location.protocol !== 'file:') {
    return;
  }

  const warning = document.createElement('div');
  warning.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 9999;
    font-size: 0.9rem;
    max-width: 350px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    animation: slideIn 0.5s ease-out;
  `;
  warning.innerHTML = `
    <div style="font-size: 1.2rem;">i</div>
    <div>
      <strong>Mode fichier local detecte</strong><br>
      Les performances et le cache peuvent etre limites.<br>
      <em style="font-size: 0.8em; color: #666;">Conseil : lancez un serveur local (ex: <code>npx serve</code>) pour une experience optimale.</em>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#856404; opacity:0.5; margin-left:auto;">&times;</button>
  `;
  document.body.appendChild(warning);
}
