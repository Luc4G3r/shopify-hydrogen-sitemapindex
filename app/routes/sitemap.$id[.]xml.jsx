import Sitemap from '~/components/Sitemap.jsx';

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({params, request, context}) {
  if (!params.id) {
    return redirectToMainSitemap();
  }

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
      Sitemap.fetchProducts({context}),
      Sitemap.fetchCollections({context}),
      Sitemap.fetchPages({context}),
    ]);

  if (
    0 === data.sitemaps.products.nodes.length &&
    0 === data.sitemaps.collections.nodes.length &&
    0 === data.sitemaps.pages.nodes.length
  ) {
    throw new Response('No data found', {status: 404});
  }

  const sitemap = await generateSitemap({
    context,
    data,
    index: params.id,
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

async function generateSitemap({context, data, index = 1, baseUrl}) {
  let urlsByIndex = [];
  let currentIndex = 1;
  let count = 1;

  const [sitemapChunkSize, urls] = await Promise.all([
    Sitemap.getSitemapUrlChunkSize({context}),
    Sitemap.generateSitemapUrls({context, data, baseUrl}),
  ]);

  urls.forEach(function (url) {
    if (currentIndex <= index) {
      if (!urlsByIndex[currentIndex]) {
        urlsByIndex[currentIndex] = [];
      }

      if (count < sitemapChunkSize) {
        urlsByIndex[currentIndex].push(url);
        count++;
      } else {
        currentIndex++;
        urlsByIndex[currentIndex] = [];
        urlsByIndex[currentIndex].push(url);
        count = 1;
      }
    }
  });

  let sitemapCount = 0;
  urlsByIndex.forEach(function (items, index) {
    if (undefined !== items) {
      sitemapCount++;
    }
  });

  if (2 > sitemapCount) {
    return undefined;
  }

  if (!urlsByIndex[index]) {
    return undefined;
  }

  return `
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    >
      ${urlsByIndex[index].map(Sitemap.renderUrlTag).join('')}
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
