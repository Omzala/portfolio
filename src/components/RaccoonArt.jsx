import { useId } from 'react';

// A flat drawing of Bandit, shown when WebGL is unavailable.
export default function RaccoonArt({ className = '' }) {
  const id = useId().replace(/:/g, '');
  return <svg className={className} viewBox="0 0 400 460" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}g`} cx="0.35" cy="0.3" r="0.85"><stop offset="0" stopColor="#5BE7DA" stopOpacity="0.2" /><stop offset="1" stopColor="#07070C" stopOpacity="0.25" /></radialGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2B2A38" /><stop offset="1" stopColor="#15141D" /></linearGradient>
      <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B3AFC0" /><stop offset="1" stopColor="#7B778C" /></linearGradient>
    </defs>
    <rect x="34" y="364" width="46" height="96" rx="18" fill="#3A3948" />
    <rect x="320" y="364" width="46" height="96" rx="18" fill="#3A3948" />
    <path d="M60 460C60 388 118 346 200 346s140 42 140 114Z" fill={`url(#${id}s)`} />
    <path d="M92 420l58-40M308 420l-58-40" stroke="#FF6A2B" strokeWidth="10" strokeLinecap="round" />
    <rect x="222" y="398" width="62" height="32" rx="9" fill="#07070C" stroke="#5BE7DA" strokeWidth="2" />
    <circle cx="240" cy="414" r="5" fill="#5BE7DA" /><circle cx="258" cy="414" r="5" fill="#FF6A2B" />
    <path d="M112 150 98 70q4-14 18-8l54 50Z" fill="#6E6A7E" /><path d="m120 136-8-52 44 34Z" fill="#26242F" />
    <path d="m288 150 14-80q-4-14-18-8l-54 50Z" fill="#6E6A7E" /><path d="m280 136 8-52-44 34Z" fill="#26242F" />
    <ellipse cx="200" cy="202" rx="112" ry="96" fill={`url(#${id}f)`} />
    <path d="m92 214-26 24 32-4-16 26 36-14ZM308 214l26 24-32-4 16 26-36-14Z" fill="#8E8A9E" />
    <ellipse cx="156" cy="160" rx="34" ry="13" fill="#ECE9F1" transform="rotate(-12 156 160)" />
    <ellipse cx="244" cy="160" rx="34" ry="13" fill="#ECE9F1" transform="rotate(12 244 160)" />
    <path d="m200 110-13 42h26Z" fill="#4A4758" />
    <path d="M94 202q14-32 62-25 30 5 44 20 14-15 44-20 48-7 62 25-6 32-52 32-32 0-54-19-22 19-54 19-46 0-52-32Z" fill="#17161D" />
    <circle cx="156" cy="204" r="15" fill="#F3F0E8" /><circle cx="244" cy="204" r="15" fill="#F3F0E8" />
    <circle cx="160" cy="206" r="8" fill="#07070C" /><circle cx="248" cy="206" r="8" fill="#07070C" />
    <circle cx="163" cy="202" r="3" fill="#fff" /><circle cx="251" cy="202" r="3" fill="#fff" />
    <ellipse cx="200" cy="256" rx="52" ry="36" fill="#ECE9F1" />
    <path d="M186 238q14-8 28 0 0 12-14 16-14-4-14-16Z" fill="#111016" />
    <path d="M200 254v10q-12 10-22 2m22-2q14 12 28-2" stroke="#111016" strokeWidth="3" strokeLinecap="round" />
    <circle cx="200" cy="198" r="160" fill={`url(#${id}g)`} stroke="#F3F0E8" strokeOpacity="0.4" strokeWidth="3" />
    <path d="M88 124A132 132 0 0 1 178 60" stroke="#fff" strokeOpacity="0.6" strokeWidth="9" strokeLinecap="round" />
    <ellipse cx="200" cy="348" rx="120" ry="24" fill="#23222E" stroke="#FF6A2B" strokeWidth="3" />
    <path d="m292 62 28-44" stroke="#3A3948" strokeWidth="5" strokeLinecap="round" />
    <circle cx="322" cy="14" r="9" fill="#5BE7DA" />
  </svg>;
}
