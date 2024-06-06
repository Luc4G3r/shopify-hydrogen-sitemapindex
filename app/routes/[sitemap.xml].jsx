import Sitemap from '~/components/Sitemap.jsx';

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({request, context: {storefront}}) {
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
      Sitemap.fetchProducts({storefront}),
      Sitemap.fetchCollections({storefront}),
      Sitemap.fetchPages({storefront}),
    ]);

  if (
    0 === data.sitemaps.products.nodes.length &&
    0 === data.sitemaps.collections.nodes.length &&
    0 === data.sitemaps.pages.nodes.length
  ) {
    throw new Response('No data found', {status: 404});
  }

  const sitemap = generateSitemap({data, baseUrl: new URL(request.url).origin});

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',

      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

/**
 * @param {{
 *   data: SitemapQuery;
 *   baseUrl: string;
 * }}
 */
function generateSitemap({data, baseUrl}) {
  const entries =
    data.sitemaps.products.nodes.length +
    data.sitemaps.collections.nodes.length +
    data.sitemaps.pages.nodes.length;

  if (entries > Sitemap.getMaxUrls()) {
    return generateIndexedSitemap({data, baseUrl, entries});
  }

  return generateSingleSitemap({data, baseUrl});
}

function generateIndexedSitemap({baseUrl, entries}) {
  let numberOfSitemaps = Math.ceil(entries / Sitemap.getMaxUrls());

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

function generateSingleSitemap({data, baseUrl}) {
  const urls = Sitemap.generateSitemapUrls({data, baseUrl});

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
