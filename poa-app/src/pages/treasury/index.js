import SEOHead from "@/components/common/SEOHead";
import TreasuryPage from '@/components/treasury/TreasuryPage';

const Treasury = () => (
  <>
    <SEOHead
      title="Treasury"
      description="Organization treasury and finances."
      path="/treasury"
      noIndex
    />
    <TreasuryPage />
  </>
);

export default Treasury;
