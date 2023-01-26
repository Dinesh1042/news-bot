import dotenv from 'dotenv';
import { FFCreator, FFAlbum, FFScene, FFText, FFSubtitle } from 'ffcreator';
import fs from 'fs';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import { getAllAudioBase64 } from 'google-tts-api';
// @ts-ignore
import keywordExtractor from 'keyword-extractor';
import _ from 'lodash';
import path from 'path';
import { createClient } from 'pexels';
import puppeteer from 'puppeteer';
// @ts-ignore
import textSummary from 'text-summarization';

dotenv.config();

const { PEXELS_API_KEY = '' } = process.env;

const client = createClient(PEXELS_API_KEY);

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

const getAudioDuration = (path: string): Promise<number> => {
  return getAudioDurationInSeconds(path);
};

const getImageFromQuery = (query: string): Promise<string> => {
  return client.photos
    .search({ query, per_page: 1 })
    .then((photos: any) => photos.photos[0].src.portrait);
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
    const firstArticle = (await _.head(articles)) || { href: '', title: '' };

    await page.goto(firstArticle.href);

    const textContentDiv = await page.$$('[data-component="text-block"]');

    const textContent = _.map(
      textContentDiv,
      async (textContent) =>
        (await (
          await (await textContent.$('p'))?.getProperty('textContent')
        )?.jsonValue()) || ''
    );

    const text = (await Promise.all(textContent)).join(' ');
    const summaryText = await getSummarizedText(firstArticle.title, text);
    const summaryKeywords = getKeywordFromSummary(firstArticle.title);
    const images = await Promise.all(summaryKeywords.map(getImageFromQuery));

    browser.close();
    return {
      title: firstArticle.title,
      url: firstArticle.href,
      content: text,
      summary: summaryText,
      keywords: summaryKeywords,
      images,
    };
  } catch (error) {
    throw new Error((error as Error).message || 'Something went wrong');
  }
};

(async () => {
  const article = await getArticle();
  // const article = {
  //   title: `King Charles's coronation plans include Windsor concert`,
  //   url: '',
  //   content: '',
  //   summary: `It will come the day after the coronation at Westminster Abbey. The ceremony is expected to be a shorter, smaller and a more diverse occasion than for Elizabeth II's coronation in 1953. Not yet confirmed who will then appear with them on the balcony at Buckingham Palace. There have been suggestions that the dress code for those attending the coronation is likely to be more modern. There will be scrutiny of whether the coronation oath is updated to say a wider range of beliefs. Attention will be paid to the cost of the state-funded coronation. According to the House of Commons Library, the coronation in 1953 cost the equal of £18.8m in 2021 prices.`,
  //   keywords: [],
  // };
  const audioBinary = await getAudioBinary(article.summary);
  console.log(article);

  const outputDir = path.join(__dirname, '../assets/output/'); // you can add anything
  const cacheDir = path.join(__dirname, '../assets/cache/');
  const audioPath = path.join(__dirname, '../audio.mp3');

  const videoCreator = new FFCreator({
    cacheDir,
    outputDir,
    width: 1080,
    height: 1920,
  });

  fs.writeFileSync(audioPath, audioBinary, 'base64'); // Blocking The Node
  const audioDuration = await getAudioDuration(audioPath);
  videoCreator.addAudio(audioPath);

  const scene = new FFScene();
  scene.setBgColor('#c4c4c4');
  scene.setDuration(audioDuration);

  const album = new FFAlbum({
    list: article.images,
    x: 1080 / 2,
    y: 1920 / 2,
    width: 1080,
    scale: 1.7,
  });
  album.setTransition('zoomIn');
  album.setDuration(audioDuration / article.images.length);

  const text = new FFText({
    text: article.summary,
    x: 1080 / 2,
    y: 1920 - 800,
    fontSize: 48,
  });

  text.setStyle({
    backgroundColor: '#ffffff90',
    padding: 40,
  });
  text.setWrap(900);
  text.alignCenter();

  scene.addChild(album);
  scene.addChild(text);
  videoCreator.addChild(scene);

  videoCreator.start();
  videoCreator.closeLog();

  videoCreator.on('start', () => {
    console.log(`Started Video Creation`);
  });

  videoCreator.on('error', (e: any) => {
    console.log(`Video Creation error: ${e.error}`);
  });

  videoCreator.on('progress', (e: any) => {
    console.log(`Video Creation progress: ${(e.percent * 100) >> 0}%`);
  });

  videoCreator.on('complete', async (e: any) => {
    console.info(`Video created`);
  });
})();
