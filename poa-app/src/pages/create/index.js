import Page from '@/features/deployer/CreatePage';

Page.seo = {
  "title": "Create a Community-Owned Organization on Poa (No Code)",
  "description": "Launch a community-owned organization on poa.box in five steps. Pick a governance model. Set up roles. Configure the treasury. Sign once. No code required.",
  "path": "/create",
  "keywords": [
    "create a DAO",
    "no-code DAO",
    "launch community-owned organization",
    "DAO setup",
    "create worker cooperative DAO",
    "create student organization DAO",
    "poa.box"
  ],
  "jsonLd": {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to create a community-owned organization on poa.box",
    "description": "Launch a no-code DAO on Poa: name your organization, choose a governance model, set up roles, configure treasury and gas, and deploy on-chain.",
    "totalTime": "PT10M",
    "step": [
      {
        "@type": "HowToStep",
        "position": 1,
        "name": "Name and describe your community",
        "text": "Pick a name, write a short description, upload a logo, and add links to your existing community spaces (Discord, Twitter, GitHub)."
      },
      {
        "@type": "HowToStep",
        "position": 2,
        "name": "Choose a governance model",
        "text": "Pick direct democracy, contribution-based voting, or a hybrid. Configure quorum and approval thresholds for your community-owned organization."
      },
      {
        "@type": "HowToStep",
        "position": 3,
        "name": "Create roles and permissions",
        "text": "Add member roles, executive roles, and committees. Set vouching requirements and granular permissions for each tier of membership."
      },
      {
        "@type": "HowToStep",
        "position": 4,
        "name": "Set up treasury and gas sponsorship",
        "text": "Configure how your organization's on-chain treasury is managed and whether gas is sponsored from the protocol's solidarity fund or self-funded."
      },
      {
        "@type": "HowToStep",
        "position": 5,
        "name": "Deploy on-chain",
        "text": "Review the configuration, sign with your wallet or passkey, and deploy the DAO. The organization is live the moment the transaction confirms."
      }
    ]
  }
};

export default Page;
