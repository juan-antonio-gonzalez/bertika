import LegalLayout from '../components/LegalLayout';
import { LEGAL_DOCS } from '../data/legal';

export default function Cookies() {
  return <LegalLayout doc={LEGAL_DOCS.cookies} />;
}
