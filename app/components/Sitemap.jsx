import {flattenConnection} from '@shopify/hydrogen';

/**
 * the google limit is 50K, however, the storefront API
 * allows querying only 250 resources per pagination page
 */
const GRAPHQL_MAX_ENTRIES = 250;
/**
 * limit number of indexed sidemaps files
 */
const SITEMAPS_LIMIT = 300;
/**
 * limit number of URLS in sidemap files
 */
const MAX_URLS = 50000;
/**
 * default API call cache settings
 */
const CACHE_SETTINGS_DEFAULT = {
  mode: 'public',
  maxAge: 1,
  staleWhileRevalidate: 300,
};

const Sitemap = {
  config: {
    chunkSize: null,
    cursors: {
      products: null,
      collections: null,
      pages: null,
    },
    cacheSettings: null,
  },

  /**
   * fetch products
   *
   * @param env
   * @param storefront
   * @param limit
   * @returns {Promise<*>}
   */
  async fetchProducts({env, storefront, limit}) {
    const query = SITEMAP_PRODUCT_QUERY;
    const type = 'products';
    let result = null;
    if (limit) {
      result = Sitemap.fetchByType({env, storefront, query, type, limit});
    }
    result = Sitemap.fetchAllByType({env, storefront, query, type});
    Sitemap.resetCursor({type});

    return result;
  },

  /**
   * fetch collections
   *
   * @param env
   * @param storefront
   * @param limit
   * @returns {Promise<*>}
   */
  async fetchCollections({env, storefront, limit}) {
    const query = SITEMAP_COLLECTION_QUERY;
    const type = 'collections';
    let result = null;
    if (limit) {
      result = Sitemap.fetchByType({env, storefront, query, type, limit});
    }
    result = Sitemap.fetchAllByType({env, storefront, query, type});
    Sitemap.resetCursor({type});

    return result;
  },

  /**
   * fetch pages
   *
   * @param env
   * @param storefront
   * @param limit
   * @returns {Promise<*>}
   */
  async fetchPages({env, storefront, limit}) {
    const query = SITEMAP_PAGE_QUERY;
    const type = 'pages';
    let result = null;
    if (limit) {
      result = Sitemap.fetchByType({env, storefront, query, type, limit});
    }
    result = Sitemap.fetchAllByType({env, storefront, query, type});
    Sitemap.resetCursor({type});

    return result;
  },

  /**
   * fetch next chunk of entries
   *
   * @param env
   * @param storefront
   * @param query
   * @param type
   * @returns {Promise<*>}
   */
  async fetchNextChunkByType({env, storefront, query, type}) {
    if (!env) {
      throw new Error('Environment is not defined');
    }

    if (!storefront) {
      throw new Error('Storefront is not defined');
    }

    let queryVariables = await Sitemap.getQueryVariables({
      env,
      storefront,
      type,
    });

    return storefront.query(query, {
      variables: queryVariables,
      cache: storefront.CacheCustom(Sitemap.getCacheSettings({env})),
    });
  },

  /**
   * fetch entries by type
   *
   * @param env
   * @param storefront
   * @param query
   * @param type
   * @param limit
   * @returns {Promise<*>}
   */
  async fetchByType({env, storefront, query, type, limit}) {
    if (!type) {
      throw new Error('Type is not defined');
    }

    let continueFetch = true;

    let sitemapData = {};
    sitemapData[type] = {
      nodes: [],
    };

    while (continueFetch) {
      continueFetch = false;
      const currentSitemapData = await Sitemap.fetchNextChunkByType({
        env,
        storefront,
        query,
        type,
      });

      if (Object.prototype.hasOwnProperty.call(currentSitemapData, 'errors')) {
        continueFetch = false;
        currentSitemapData.errors.forEach(function (error) {
          console.error(error);
        });
        return sitemapData[type];
      }

      const nodes = flattenConnection(currentSitemapData[type]);
      if (0 !== nodes.length) {
        nodes.forEach(function (element) {
          sitemapData[type].nodes.push(element);
        });

        if (
          Object.prototype.hasOwnProperty.call(
            currentSitemapData[type],
            'pageInfo',
          )
        ) {
          if (
            Object.prototype.hasOwnProperty.call(
              currentSitemapData[type].pageInfo,
              'hasNextPage',
            )
          ) {
            continueFetch = currentSitemapData[type].pageInfo.hasNextPage;

            if (continueFetch) {
              const cursorValue =
                currentSitemapData[type].pageInfo.endCursor ?? null;

              Sitemap.setCursor({
                type,
                value: cursorValue,
              });
            }
          }
        }
      }

      if (sitemapData[type].nodes.length > limit) {
        console.log('Reached limit of sitemap files.');
        continueFetch = false;
      }
    }

    return sitemapData[type];
  },

  /**
   * fetch all entries by type
   *
   * @param env
   * @param storefront
   * @param query
   * @param type
   * @returns {Promise<*>}
   */
  async fetchAllByType({env, storefront, query, type}) {
    const limit =
      SITEMAPS_LIMIT * (await Sitemap.getSitemapUrlChunkSize({env}));

    return Sitemap.fetchByType({
      env,
      storefront,
      query,
      type,
      limit,
    });
  },

  /**
   * generate urls from data entries
   *
   * @param data
   * @param baseUrl
   * @returns {*[]}
   */
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

  /**
   * get configured sitemap chunk size
   *
   * @param env
   * @returns {Promise<number>}
   */
  async getSitemapUrlChunkSize({env}) {
    if (undefined === env) {
      throw new Error('No environment given');
    }

    if (
      null === Sitemap.config.chunkSize ||
      undefined === Sitemap.config.chunkSize ||
      Number.isNaN(Sitemap.config.chunkSize)
    ) {
      Sitemap.config.chunkSize = Sitemap.getQueryUrlLimit();
      if (env && env.SITEMAP_URL_CHUNK_SIZE) {
        let chunkSize = env.SITEMAP_URL_CHUNK_SIZE;

        /* chunkSize might be NaN */
        if (Number.isNaN(chunkSize)) {
          console.error('SITEMAP_URL_CHUNK_SIZE is NaN');
        } else {
          Sitemap.config.chunkSize = chunkSize;
        }
      }
    }

    return parseInt(Sitemap.config.chunkSize);
  },

  /**
   * get cache settings for API calls
   *
   * @param env
   * @returns {null}
   */
  getCacheSettings({env}) {
    if (
      null === Sitemap.config.cacheSettings ||
      undefined === Sitemap.config.cacheSettings
    ) {
      Sitemap.config.cacheSettings = CACHE_SETTINGS_DEFAULT;
      if (env && env.SITEMAP_GRAPHQL_CACHE_SETTINGS_JSON) {
        try {
          Sitemap.config.cacheSettings = JSON.parse(
            env.SITEMAP_GRAPHQL_CACHE_SETTINGS_JSON,
          );
        } catch (e) {
          console.error(e);
        }
      }
    }

    return Sitemap.config.cacheSettings;
  },

  /**
   * get limit for API calls
   *
   * @returns {number}
   */
  getQueryUrlLimit() {
    if (GRAPHQL_MAX_ENTRIES < MAX_URLS) {
      return GRAPHQL_MAX_ENTRIES;
    }

    return MAX_URLS;
  },

  getCursor({type}) {
    if (!type) {
      throw new Error('Cannot get cursor for undefined');
    }

    return Sitemap.config.cursors[type];
  },

  setCursor({type, value}) {
    if (!type) {
      throw new Error('Cannot get cursor for undefined');
    }

    Sitemap.config.cursors[type] = value;
  },

  resetCursor({type}) {
    Sitemap.config.cursors[type] = null;
  },

  /**
   * get parameters for API calls
   *
   * @param env
   * @param storefront
   * @param type
   * @returns {Promise<{cursor: *, language: , urlLimits: number}>}
   */
  async getQueryVariables({env, storefront, type}) {
    const urlLimits = await Sitemap.getSitemapUrlChunkSize({env});

    return {
      urlLimits,
      language: storefront.i18n.language,
      cursor: Sitemap.getCursor({type}),
    };
  },

  /**
   * encode for XML
   *
   * @param string
   * @returns {*}
   */
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
