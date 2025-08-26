export const UserAgentForWebsites = {
  youtube:
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
};
const yourubeHosts = [
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "youtube.co.jp",
];

export const getDynamicUserAgent = (host: string) => {
  if (yourubeHosts.includes(host)) {
    return UserAgentForWebsites.youtube;
  }

  // firefox on macos
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.5; rv:141.0) Gecko/20100101 Firefox/141.0";
};
