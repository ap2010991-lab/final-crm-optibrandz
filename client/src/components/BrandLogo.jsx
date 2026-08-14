export default function BrandLogo({ className = "size-11" }) {
  return <svg viewBox="0 0 64 64" role="img" aria-label="Optibrandz" className={`${className} shrink-0 rounded-full`}>
    <circle cx="32" cy="32" r="32" fill="#090909" />
    <text x="32" y="41" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontSize="22" fontWeight="900" fill="#ffd84d">OB</text>
  </svg>;
}
