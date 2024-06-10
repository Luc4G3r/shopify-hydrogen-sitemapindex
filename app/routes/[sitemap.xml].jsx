import Sitemap from '~/components/Sitemap.jsx';

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({request, context}) {
  const {env, storefront} = context;

  let data = {
    sitemaps: {
      products: null,
      collections: null,
      pages: null,
    },
  };

  /* fetch simultaneously */
  [data.sitemaps.products, data.sitemaps.collections, data.sitemaps.pages] =
    await Promise.all([
      Sitemap.fetchProducts({env, storefront}),
      Sitemap.fetchCollections({env, storefront}),
      Sitemap.fetchPages({env, storefront}),
    ]);

  if (
    (!data.sitemaps.products?.nodes ||
      0 === data.sitemaps.products.nodes.length) &&
    (!data.sitemaps.collections?.nodes ||
      0 === data.sitemaps.collections.nodes.length) &&
    (!data.sitemaps.pages?.nodes || 0 === data.sitemaps.pages.nodes.length)
  ) {
    throw new Response('No data found', {status: 404});
  }

  const sitemap = await generateSitemapContent({
    env,
    data,
    baseUrl: new URL(request.url).origin,
  });

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,

      // 'Cache-Control': `public, max-age=${
      //   60 * 60 * 24
      // }, stale-while-revalidate=300`,
    },
  });
}

/**
 * @param {{
 *   data: SitemapQuery;
 *   baseUrl: string;
 * }}
 */
async function generateSitemapContent({env, data, baseUrl}) {
  const entries =
    data.sitemaps.products.nodes.length +
    data.sitemaps.collections.nodes.length +
    data.sitemaps.pages.nodes.length;

  const sitemapChunkSize = await Sitemap.getSitemapUrlChunkSize({env});
  if (entries > sitemapChunkSize) {
    return await generateIndexedSitemapContent({env, data, baseUrl, entries});
  }

  return await generateSingleSitemapContent({data, baseUrl});
}

async function generateIndexedSitemapContent({env, baseUrl, entries}) {
  let numberOfSitemaps = Math.ceil(
    entries / (await Sitemap.getSitemapUrlChunkSize({env})),
  );

  let urls = [];
  let count = 1;
  while (count <= numberOfSitemaps) {
    const url = `${baseUrl}/sitemap/${count}.xml`;
    urls.push({
      url,
    });
    count++;
  }

  return `
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${urls.map(renderSitemapTag).join('')}
    </sitemapindex>
  `.trim();
}

async function generateSingleSitemapContent({data, baseUrl}) {
  const urls = await Sitemap.generateSitemapUrls({data, baseUrl});

  return `
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    >
      ${urls.map(Sitemap.renderUrlTag).join('')}
    </urlset>`;
}

/**
 * @param {Entry}
 */
function renderSitemapTag({url}) {
  return `
    <sitemap>
      <loc>${url}</loc>
    </sitemap>
  `.trim();
}

/**
 * @typedef {{
 *   url: string;
 *   lastMod?: string;
 *   changeFreq?: string;
 *   image?: {
 *     url: string;
 *     title?: string;
 *     caption?: string;
 *   };
 * }} Entry
 */

/** @typedef {import('@shopify/remix-oxygen').LoaderFunctionArgs} LoaderFunctionArgs */
/** @typedef {import('storefrontapi.generated').SitemapQuery} SitemapQuery */
/** @typedef {import('@shopify/remix-oxygen').SerializeFrom<typeof loader>} LoaderReturnData */
