import Sitemap from '~/components/Sitemap.jsx';
import {redirect} from '@shopify/remix-oxygen';

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({params, request, context: {storefront}}) {
  console.debug(params);
  if (!params.id) {
    return redirect('/sitemap.xml');
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

  const sitemap = generateSitemap({
    data,
    index: params.id,
    baseUrl: new URL(request.url).origin,
  });

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',

      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

function generateSitemap({data, index = 1, baseUrl}) {
  let urlsByIndex = [];
  let currentIndex = 1;
  let count = 1;

  const urls = Sitemap.generateSitemapUrls({data, baseUrl});

  urls.forEach(function (url) {
    if (currentIndex <= index) {
      if (!urlsByIndex[currentIndex]) {
        urlsByIndex[currentIndex] = [];
      }

      if (count < Sitemap.getMaxUrls()) {
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

  return `
    <urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    >
      ${urlsByIndex[index].map(Sitemap.renderUrlTag).join('')}
    </urlset>`;
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
