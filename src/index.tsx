import { Hono } from "hono";
import { renderer } from "./renderer";
import { getOGP, OGPData } from "./lib/ogp";
import { raw } from "hono/html";

type Bindings = {
  OGP_CACHE: KVNamespace;
};

const app = new Hono<{
  Bindings: Bindings;
}>();

const getCachedOGP = async (
  url: string,
  cache: KVNamespace
): Promise<OGPData> => {
  const cached = await cache.get(url, "json");
  if (cached) {
    return cached as OGPData;
  }

  const ogp = await getOGP(url);
  await cache.put(url, JSON.stringify(ogp), { expirationTtl: 60 * 60 }); // Cache for 1 hour
  return ogp;
};

app.use(renderer);

app.get("/", (c) => {
  return c.text("Hello!");
});

app.get("/message", (c) => {
  return c.render(<></>);
});

app.get("/embed", async (c) => {
  const { url } = c.req.query();
  if (!url) {
    return c.text("Please provide a URL query parameter.", 400);
  }

  try {
    const ogp = await getCachedOGP(decodeURIComponent(url), c.env.OGP_CACHE);

    return c.render(
      <div
        class={
          "flex h-screen w-full max-h-40 rounded-xl tracking-tight group bg-linkcard"
        }
      >
        <div
          class={
            "min-w-0 w-full h-full py-5 flex flex-col justify-between px-6"
          }
        >
          <h1 class={"text-lg leading-[1.1] font-semibold"}>
            {raw(ogp.title ?? "")}
          </h1>
          <p class={"text-sm truncate text-secondary w-full"}>
            {raw(ogp.description ?? "")}
          </p>

          <p class={"text-sm group-hover:underline"}>{ogp.url ?? ""}</p>
        </div>

        {ogp.image && (
          <div class={"max-w-1/3 w-80 flex flex-col items-center"}>
            <img
              class={"w-full h-full object-cover"}
              src={raw(ogp.image)}
              alt={ogp.title || "OGP Image"}
            />
          </div>
        )}
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An error occurred";

    return c.render(
      <div
        class={
          "flex w-full justify-between gap-6 rounded-xl shadow-sm tracking-tight "
        }
      >
        <div class={"grow min-w-80 py-6 flex flex-col gap-2 px-4"}>
          <h1 class={"text-xl font-semibold"}>{message}</h1>
          <p class={"text-sm"}>Please check the URL and try again.</p>
          <p class={"text-sm"}>url={url}</p>
        </div>
      </div>
    );
  }
});

export default app;
