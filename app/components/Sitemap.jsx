import {flattenConnection} from '@shopify/hydrogen';

/**
 * the google limit is 50K, however, the storefront API
 * allows querying only 250 resources per pagination page
 */
const GRAPHQL_MAX_ENTRIES = 250;
const SITEMAPS_LIMIT = 300;
const MAX_URLS = 50000;

const Sitemap = {
  config: {
    chunkSize: null,
    cursors: {
      products: null,
      collections: null,
      pages: null,
    },
  },

  async fetchProducts({context}) {
    const query = SITEMAP_PRODUCT_QUERY;
    const type = 'products';
    return Sitemap.fetchAll({context, query, type});
  },

  async fetchCollections({context}) {
    const query = SITEMAP_COLLECTION_QUERY;
    const type = 'collections';
    return Sitemap.fetchAll({context, query, type});
  },

  async fetchPages({context}) {
    const query = SITEMAP_PAGE_QUERY;
    const type = 'pages';
    return Sitemap.fetchAll({context, query, type});
  },

  async fetchAll({context, query, type, depth}) {
    const {storefront} = await context;
    let continueFetch = false;
    const sitemapData = await storefront.query(query, {
      variables: {
        urlLimits: Sitemap.getQueryUrlLimit(),
        language: storefront.i18n.language,
        cursor: Sitemap.config.cursors[type],
      },
      cache: storefront.CacheLong(),
    });

    if (Object.prototype.hasOwnProperty.call(sitemapData[type], 'pageInfo')) {
      if (
        Object.prototype.hasOwnProperty.call(
          sitemapData[type].pageInfo,
          'hasNextPage',
        )
      ) {
        continueFetch = sitemapData[type].pageInfo.hasNextPage;
        Sitemap[type] = sitemapData[type].pageInfo.endCursor ?? null;
      }
    }

    if (continueFetch && depth < SITEMAPS_LIMIT) {
      depth = depth + 1;
      let dataToMerge = await Sitemap.fetchProducts({context});

      if (dataToMerge && dataToMerge.nodes) {
        dataToMerge.nodes.forEach(function (element) {
          sitemapData[type].nodes.push(element);
        });
      }
    }

    return sitemapData[type];
  },

  generateSitemapUrls({data, baseUrl}) {
    const products = flattenConnection(data.sitemaps.products)
      .filter((product) => product.onlineStoreUrl)
      .map((product) => {
        const url = `${baseUrl}/products/${Sitemap.xmlEncode(product.handle)}`;

        const productEntry = {
          url,
          lastMod: product.updatedAt,
          changeFreq: 'daily',
        };

        if (product.featuredImage?.url) {
          productEntry.image = {
            url: Sitemap.xmlEncode(product.featuredImage.url),
          };

          if (product.title) {
            productEntry.image.title = Sitemap.xmlEncode(product.title);
          }

          if (product.featuredImage.altText) {
            productEntry.image.caption = Sitemap.xmlEncode(
              product.featuredImage.altText,
            );
          }
        }

        return productEntry;
      });

    const collections = flattenConnection(data.sitemaps.collections)
      .filter((collection) => collection.onlineStoreUrl)
      .map((collection) => {
        const url = `${baseUrl}/collections/${collection.handle}`;

        return {
          url,
          lastMod: collection.updatedAt,
          changeFreq: 'daily',
        };
      });

    const pages = flattenConnection(data.sitemaps.pages)
      .filter((page) => page.onlineStoreUrl)
      .map((page) => {
        const url = `${baseUrl}/pages/${page.handle}`;

        return {
          url,
          lastMod: page.updatedAt,
          changeFreq: 'weekly',
        };
      });

    return [...products, ...collections, ...pages];
  },

  async getSitemapUrlChunkSize({context}) {
    if (undefined === context) {
      throw new Error('No context given');
    }

    if (null === Sitemap.config.chunkSize) {
      Sitemap.config.chunkSize = MAX_URLS;
      if (context && context.env.SITEMAP_URL_CHUNK_SIZE) {
        Sitemap.config.chunkSize = context.env.SITEMAP_URL_CHUNK_SIZE;
      }
    }

    return Sitemap.config.chunkSize;
  },

  getQueryUrlLimit() {
    if (GRAPHQL_MAX_ENTRIES < MAX_URLS) {
      return GRAPHQL_MAX_ENTRIES;
    }
    return MAX_URLS;
  },

  xmlEncode(string) {
    return string.replace(/[&<>'"]/g, (char) => `&#${char.charCodeAt(0)};`);
  },

  /**
   * @param {Entry}
   */
  renderUrlTag({url, lastMod, changeFreq, image}) {
    const imageTag = image
      ? `<image:image>
        <image:loc>${image.url}</image:loc>
        <image:title>${image.title ?? ''}</image:title>
        <image:caption>${image.caption ?? ''}</image:caption>
      </image:image>`.trim()
      : '';

    return `
    <url>
      <loc>${url}</loc>
      <lastmod>${lastMod}</lastmod>
      <changefreq>${changeFreq}</changefreq>
      ${imageTag}
    </url>
  `.trim();
  },
};

export default Sitemap;

/* aggregation queries are currently not supported by storefront API */
// const SITEMAP_ENTRIES_COUNT_QUERY = `#graphql
// query Sitemap($language: LanguageCode)
// @inContext(language: $language) {
//   aggregateProducts(
//     query: "published_status:'online_store:visible'"
//   ) {
//     count
//   }
// }
// `;

const SITEMAP_PRODUCT_QUERY = `#graphql
query SitemapProducts(
  $urlLimits: Int
  $language: LanguageCode
  $cursor: String
)
@inContext(language: $language) {
  products(
    first: $urlLimits
    after: $cursor
    query: "published_status:'online_store:visible'"
  ) {
    nodes {
      updatedAt
      handle
      onlineStoreUrl
      title
      featuredImage {
        url
        altText
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const SITEMAP_COLLECTION_QUERY = `#graphql
query SitemapCollections(
  $urlLimits: Int
  $language: LanguageCode
  $cursor: String
)
@inContext(language: $language) {
  collections(
    first: $urlLimits
    after: $cursor
    query: "published_status:'online_store:visible'"
  ) {
    nodes {
      updatedAt
      handle
      onlineStoreUrl
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const SITEMAP_PAGE_QUERY = `#graphql
query SitemapPages(
  $urlLimits: Int
  $language: LanguageCode
  $cursor: String
)
@inContext(language: $language) {
  pages(
    first: $urlLimits
    after: $cursor
    query: "published_status:'published'"
  ) {
    nodes {
      updatedAt
      handle
      onlineStoreUrl
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;
