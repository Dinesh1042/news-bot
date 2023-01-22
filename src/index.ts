import { getAllAudioBase64 } from 'google-tts-api';
import keywordExtractor from 'keyword-extractor';
import _ from 'lodash';
import puppeteer from 'puppeteer';
// @ts-ignore
import textSummary from 'text-summarization';
import fs from 'fs';

const newsUrl = 'http://feeds.bbci.co.uk/news/rss.xml';

const getSummarizedText = (title: string, content: string): Promise<string> => {
  return textSummary({ text: content, maxNumSentences: 5, title }).then(
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

const getAudioBinary = (content: string): Promise<Buffer> => {
  return getAllAudioBase64(content)
    .then((s) => s.reduce((acc, { base64 }) => (acc += base64), ''))
    .then((base64Audio) => Buffer.from(base64Audio, 'base64'));
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
    const firstArticle = (await articles[1]) || { href: '', title: '' };

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
    const summaryText = await getSummarizedText(firstArticle.title, text);
    const summaryKeywords = getKeywordFromSummary(summaryText);

    browser.close();
    return {
      title: firstArticle.title,
      url: firstArticle.href,
      content: text,
      summary: summaryText,
      keywords: summaryKeywords,
    };
  } catch (error) {
    throw new Error((error as Error).message || 'Something went wrong');
  }
};

(async () => {
  const article = await getArticle();
  const audioBinary = await getAudioBinary(article.summary);


  console.log(article);
})();
