const path = require("node:path");
const eleventySass = require("eleventy-sass");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(eleventySass, {
    sass: {
      style: "compressed",
      sourceMap: false,
    },
  });

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/scripts": "scripts" });

  eleventyConfig.setServerOptions({
    showAllHosts: true,
  });

  eleventyConfig.addFilter("maxLogical", (items, key) =>
    Math.max(...items.map((item) => item[key] / (item.scale || 1))),
  );

  eleventyConfig.addCollection("faq", (collectionApi) =>
    collectionApi
      .getAll()
      .filter((item) => item.inputPath.includes(`${path.sep}faq${path.sep}`))
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)),
  );

  eleventyConfig.addWatchTarget("src/styles");
  eleventyConfig.addWatchTarget("src/scripts");
  eleventyConfig.addWatchTarget("src/faq");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
