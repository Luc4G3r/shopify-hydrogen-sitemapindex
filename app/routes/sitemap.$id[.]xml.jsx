import Sitemap from '~/components/Sitemap.jsx';

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({params, request, context}) {
  if (!params.id) {
    return redirectToMainSitemap();
  }

  const sitemapIndex = parseInt(params.id);

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

  const sitemap = await generateIndexedSitemapContent({
    env,
    data,
    sitemapIndex,
    baseUrl: new URL(request.url).origin,
  });

  if (!sitemap) {
    return redirectToMainSitemap();
  }

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',

      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

async function generateIndexedSitemapContent({
  env,
  data,
  sitemapIndex = 1,
  baseUrl,
}) {
  let urlsByIndex = {};
  let currentIndex = 1;
  let count = 0;

  const sitemapChunkSize = await Sitemap.getSitemapUrlChunkSize({env});

  const urls = await Sitemap.generateSitemapUrls({data, baseUrl});

  /* redirect to single sitemap */
  if (urls.length < sitemapChunkSize) {
    return undefined;
  }

  urls.forEach(function (url) {
    if (currentIndex === sitemapIndex) {
      if (!urlsByIndex[currentIndex]) {
        urlsByIndex[currentIndex] = [];
      }
      urlsByIndex[currentIndex].push(url);
    }
    count++;
    if (count >= sitemapChunkSize) {
      currentIndex++;
      count = 0;
    }
  });

  if (!urlsByIndex[sitemapIndex]) {
    return undefined;
  }

  return `
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    >
      ${urlsByIndex[sitemapIndex].map(Sitemap.renderUrlTag).join('')}
    </urlset>`;
}

function redirectToMainSitemap() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/sitemap.xml',
    },
  });
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
