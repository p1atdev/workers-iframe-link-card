export const UserAgentForWebsites = {
  default: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.5; rv:141.0) Gecko/20100101 Firefox/141.0",
  platesmania: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  youtube: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
};

const youtubeHosts = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "youtube.co.jp",
];

export const getDynamicUserAgent = (host: string) => {
  const normalizedHost = host.toLowerCase();

  if (youtubeHosts.includes(normalizedHost)) {
    return UserAgentForWebsites.youtube;
  }

  if (normalizedHost === "platesmania.com" || normalizedHost.endsWith(".platesmania.com")) {
    return UserAgentForWebsites.platesmania;
  }

  return UserAgentForWebsites.default;
};

export const getRequestHeaders = (host: string): HeadersInit => {
  return {
    "User-Agent": getDynamicUserAgent(host),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  };
};
