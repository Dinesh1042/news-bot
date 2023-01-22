import keywordExtractor from 'keyword-extractor';
import _ from 'lodash';
import puppeteer from 'puppeteer';
// @ts-ignore
import textSummary from 'text-summarization';

const newsUrl = 'http://feeds.bbci.co.uk/news/rss.xml';

const getSummarizedText = (content: string): Promise<string> => {
  return textSummary({ text: content }).then(
    ({ extractive }: { extractive: string[] }) => extractive.join(' ')
  );
};

const getKeywordFromSummary = (content: string): string[] => {
  return keywordExtractor.extract(content, {
    remove_duplicates: true,
    remove_digits: true,
    return_chained_words: true,
    return_changed_case: true,
    language: 'english',
  });
};

const getArticle = async () => {
  try {
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
    const summaryText = await getSummarizedText(text);
    const summaryKeywords = getKeywordFromSummary(summaryText);

    return {
      title: firstArticle.title,
      url: firstArticle.href,
      content: text,
      summaryText,
      keywords: summaryKeywords,
    };
  } catch (error) {
    console.log(error);
  }
};

(async () => {
  const article = await getArticle();
  console.log(article);
})();
