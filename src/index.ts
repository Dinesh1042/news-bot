import _ from 'lodash';
import puppeteer from 'puppeteer';

const newsUrl = 'http://feeds.bbci.co.uk/news/rss.xml';

const getArticle = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(newsUrl, { waitUntil: 'networkidle2' });
  const anchorLinks = await page.$$('.mainbox a');

  const articles = _.map(anchorLinks, async (anchorLink) => ({
    title:
      (await (await anchorLink.getProperty('textContent')).jsonValue()) || '',
    href: await (await anchorLink.getProperty('href')).jsonValue(),
  }));
  const firstArticle = (await _.head(articles)) || { href: '', title: '' };

  await page.goto(firstArticle.href);
  const textContentDiv = await page.$$('[data-component="text-block"]');

  const textContent = _.map(
    textContentDiv,
    async (textContent) =>
      await (
        await (await textContent.$('p'))?.getProperty('textContent')
      )?.jsonValue()
  );

  const text = (await Promise.all(textContent)).join(' ');

  return {
    title: firstArticle.title,
    url: firstArticle.href,
    content: text,
  };
};

(async () => {
  const article = await getArticle();
  console.log(article);
})();
