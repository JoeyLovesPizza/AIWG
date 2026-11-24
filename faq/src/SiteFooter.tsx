import { ParticleMark } from './ParticleMark'

const ABOUT = ['Careers', 'People', 'Insights', 'Events', 'Our Story', 'Contact']
const SECTORS = ['Biotechnology', 'Chemical & Materials', 'Electrical & Computer', 'Mechanical', 'Pharmaceutical']
const SERVICES = [
  'Patent',
  'Litigation',
  'ITC Litigation',
  'Appellate Litigation',
  'Post-Grant Proceedings',
  'Trademark & Copyright',
  'Licensing & Transactions',
]

function Column({ label, items }: { label: string; items: string[] }) {
  return (
    <nav className="footer-col" aria-label={label}>
      <p className="footer-label">{label}:</p>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <a href="#">{item}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <ParticleMark />
          </div>
          <div className="footer-cols">
            <Column label="About us" items={ABOUT} />
            <Column label="Technology Sectors" items={SECTORS} />
            <Column label="Services" items={SERVICES} />
          </div>
        </div>
        <div className="footer-bottom">
          <p>© Wolf, Greenfield &amp; Sacks, P.C.</p>
          <p>BOSTON | NEW YORK | WASHINGTON DC</p>
        </div>
      </div>
    </footer>
  )
}
