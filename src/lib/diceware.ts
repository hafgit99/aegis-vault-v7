/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Cryptographically secure random integer selection
function getRandomInt(max: number): number {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  }
  // Fallback if crypto is unavailable (highly unlikely in modern browsers)
  return Math.floor(Math.random() * max);
}

// 300 Memorable Turkish Words (Clean, positive, easy to write, no Turkish characters that might break some legacy systems, or clean Turkish characters fully preserved)
// Let's use clean Turkish characters since we are a super modern system!
export const TURKISH_WORDS = [
  'kalem', 'kagit', 'masa', 'sandalye', 'deniz', 'gunes', 'bulut', 'yagmur', 'ruzgar', 'orman',
  'nehir', 'gokyuzu', 'yildiz', 'toprak', 'cicek', 'yaprak', 'agac', 'meyve', 'elma', 'armut',
  'cilek', 'limon', 'portakal', 'ekmek', 'kahve', 'cay', 'sut', 'peynir', 'zeytin', 'domates',
  'biber', 'sogan', 'patates', 'makarna', 'pilav', 'corba', 'seker', 'tatli', 'pasta', 'kurabiye',
  'kitap', 'defter', 'silgi', 'cetvel', 'okul', 'sinif', 'ogretmen', 'ogrenci', 'bilgisayar', 'telefon',
  'klavye', 'fare', 'ekran', 'yazici', 'kamera', 'kulaklik', 'saat', 'gozluk', 'canta', 'ayakkabi',
  'elbise', 'pantolon', 'ceket', 'gomlek', 'kazak', 'sapka', 'eldiven', 'corap', 'oda', 'kapi',
  'pencere', 'duvar', 'cati', 'bahce', 'mutfak', 'banyo', 'yatak', 'yorgan', 'yastik', 'dolap',
  'ayna', 'hali', 'perde', 'isik', 'lamba', 'mum', 'ates', 'hava', 'firtina', 'kar',
  'buz', 'sis', 'dolu', 'simsek', 'dalga', 'kum', 'tas', 'kaya', 'maden', 'altin',
  'gumus', 'bakir', 'demir', 'celik', 'komur', 'petrol', 'enerji', 'elektrik', 'yol', 'sokak',
  'cadde', 'meydan', 'kopru', 'gecit', 'tunel', 'park', 'gol', 'baraj', 'dere', 'irmak',
  'vadi', 'ova', 'kanyon', 'magara', 'ada', 'yarimada', 'korfez', 'liman', 'iskele', 'gemi',
  'tekne', 'kayik', 'motor', 'araba', 'bisiklet', 'motosiklet', 'otobus', 'tren', 'metro', 'ucak',
  'helikopter', 'balon', 'uzay', 'gezegen', 'uydu', 'roket', 'astronot', 'galaksi', 'evren', 'dunya',
  'aslan', 'kaplan', 'kedi', 'kopek', 'kus', 'balik', 'at', 'esek', 'inek', 'koyun',
  'keci', 'tavuk', 'horoz', 'ordek', 'kaz', 'guvercin', 'karga', 'kartal', 'sahin', 'leylek',
  'serce', 'baykus', 'kugu', 'yunus', 'balina', 'yengec', 'istakoz', 'midye', 'kaplumbaga', 'kertenkele',
  'yilan', 'kursun', 'ders', 'sinav', 'kutuphane', 'bilgi', 'zeka', 'hafiza', 'ogrenme', 'akil',
  'fikir', 'dusunce', 'hayal', 'ruya', 'uyku', 'uyanik', 'yorgun', 'mutlu', 'neseli', 'huzurlu',
  'sakin', 'heyecanli', 'merakli', 'cesur', 'guclu', 'hizli', 'yavas', 'sicak', 'soguk', 'ilik',
  'lezzetli', 'taze', 'kuru', 'islak', 'nemli', 'temiz', 'kirli', 'guzel', 'cirkin', 'buyuk',
  'kucuk', 'genis', 'dar', 'yuksek', 'alcak', 'uzun', 'kisa', 'kalin', 'ince', 'agir',
  'hafif', 'kolay', 'zor', 'dogru', 'yanlis', 'yeni', 'eski', 'genc', 'yasli', 'zengin',
  'fakir', 'guvenli', 'tehlikeli', 'parlak', 'karanlik', 'renkli', 'beyaz', 'siyah', 'gri', 'kirmizi',
  'mavi', 'yesil', 'sari', 'turuncu', 'mor', 'pembe', 'kahverengi', 'lacivert', 'turkuaz', 'mermer',
  'granit', 'beton', 'tugla', 'kiremit', 'cimento', 'alci', 'kirec', 'fidan', 'filiz', 'gonca',
  'tomurcuk', 'basak', 'tane', 'un', 'maya', 'hamur', 'firin', 'ocak', 'izgara', 'tava',
  'tencere', 'tabak', 'bardak', 'catal', 'kasik', 'bicak', 'surahi', 'tepsi', 'koltuk', 'kanepe',
  'sehpa', 'kitaplik', 'gardrop', 'komodin', 'sifonyer', 'baza', 'battaniye', 'carsaf', 'havlu', 'avize',
  'abajur', 'aplik', 'spot', 'led', 'ampul', 'priz', 'kablo', 'sigorta', 'sayac', 'jenerator'
];

// 300 Memorable English Words (Standard high-quality memorable entries)
export const ENGLISH_WORDS = [
  'apple', 'river', 'stone', 'cloud', 'forest', 'planet', 'bright', 'summer', 'breeze', 'autumn',
  'spring', 'winter', 'sunset', 'sunrise', 'starry', 'ocean', 'island', 'valley', 'canyon', 'meadow',
  'garden', 'flower', 'pebble', 'golden', 'silver', 'bronze', 'copper', 'iron', 'wood', 'marble',
  'glass', 'cotton', 'silk', 'velvet', 'canvas', 'leather', 'paper', 'pencil', 'fountain', 'bridge',
  'castle', 'palace', 'tower', 'timber', 'beacon', 'candle', 'lantern', 'shadow', 'silence', 'whisper',
  'echo', 'melody', 'harmony', 'rhythm', 'riddle', 'journey', 'voyage', 'flight', 'safari', 'compass',
  'anchor', 'rudder', 'sailor', 'captain', 'wizard', 'knight', 'monarch', 'temple', 'shrine', 'ancient',
  'modern', 'future', 'history', 'science', 'nature', 'jungle', 'desert', 'tundra', 'glacier', 'volcano',
  'geyser', 'lagoon', 'oasis', 'summit', 'peak', 'crest', 'ridge', 'slope', 'cliff', 'coastal',
  'harbor', 'marina', 'vessel', 'yacht', 'frigate', 'galley', 'canopy', 'horizon', 'nebula', 'galaxy',
  'cosmos', 'comet', 'meteor', 'aurora', 'eclipse', 'solstice', 'equinox', 'gravity', 'magnet', 'crystal',
  'emerald', 'sapphire', 'ruby', 'diamond', 'topaz', 'opal', 'quartz', 'amber', 'pearl', 'coral',
  'fossil', 'feather', 'talon', 'beak', 'wing', 'nest', 'bough', 'branch', 'foliage', 'blossom',
  'petal', 'pollen', 'nectar', 'honey', 'wax', 'beehive', 'badger', 'beaver', 'otter', 'falcon',
  'osprey', 'eagle', 'heron', 'swan', 'dolphin', 'whale', 'seal', 'walrus', 'penguin', 'polar',
  'grizzly', 'bison', 'moose', 'elk', 'deer', 'fawn', 'rabbit', 'squirrel', 'chipmunk', 'hedgehog',
  'fox', 'wolf', 'panther', 'leopard', 'cheetah', 'jaguar', 'cougar', 'ocelot', 'lynx', 'bobcat',
  'koala', 'panda', 'wombat', 'kangaroo', 'lemur', 'gazelle', 'impala', 'zebra', 'giraffe', 'savanna',
  'prairie', 'pasture', 'orchard', 'vineyard', 'grove', 'thicket', 'bramble', 'fern', 'moss', 'lichen',
  'clover', 'ivy', 'willow', 'maple', 'oak', 'pine', 'cedar', 'redwood', 'cypress', 'spruce',
  'birch', 'beech', 'elm', 'ash', 'walnut', 'cherry', 'peach', 'plum', 'pear', 'fig',
  'olive', 'citrus', 'lemon', 'lime', 'orange', 'grape', 'berry', 'hazel', 'chestnut', 'acorn',
  'cone', 'needle', 'sap', 'bark', 'ring', 'grain', 'plank', 'beam', 'rafter', 'shingle',
  'brick', 'mortar', 'chimney', 'hearth', 'mantel', 'alcove', 'parlor', 'pantry', 'attic', 'cellar',
  'balcony', 'terrace', 'veranda', 'porch', 'gate', 'picket', 'fence', 'hedge', 'path', 'trail',
  'lane', 'alley', 'street', 'avenue', 'boulevard', 'highway', 'turnpike', 'freeway', 'roadway', 'pathway',
  'walkway', 'boardwalk', 'pier', 'jetty', 'quay', 'dock', 'slip', 'buoy', 'lighthouse', 'flare',
  'spark', 'ember', 'soot', 'smoke', 'vapor', 'mist', 'fog', 'dew', 'frost', 'snow',
  'sleet', 'hail', 'rain', 'drizzle', 'shower', 'downpour', 'monsoon', 'typhoon', 'hurricane', 'cyclone'
];

export interface DicewareOptions {
  wordCount: number;
  separator: 'space' | 'hyphen' | 'dot' | 'underscore' | 'none' | 'camel';
  language: 'tr' | 'en';
  capitalize: boolean;
  addNumber: boolean;
  addSymbol: boolean;
}

export function generateDiceware(options: DicewareOptions): string {
  const wordPool = options.language === 'tr' ? TURKISH_WORDS : ENGLISH_WORDS;
  const pickedWords: string[] = [];

  for (let i = 0; i < options.wordCount; i++) {
    const randomIndex = getRandomInt(wordPool.length);
    let word = wordPool[randomIndex];

    if (options.capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    } else {
      word = word.toLowerCase();
    }
    pickedWords.push(word);
  }

  // Connect them with selected separator
  let sep = ' ';
  if (options.separator === 'hyphen') sep = '-';
  else if (options.separator === 'dot') sep = '.';
  else if (options.separator === 'underscore') sep = '_';
  else if (options.separator === 'none') sep = '';
  else if (options.separator === 'camel') {
    sep = '';
    // If CamelCase is chosen, make sure each word is capitalized except possibly the first, or all for consistency.
    // We already handled individual word capitalization according to 'options.capitalize'.
    // Let's force-capitalize all words from 2nd word onwards if Camel is chosen.
    for (let i = 0; i < pickedWords.length; i++) {
      if (i > 0 || options.capitalize) {
        pickedWords[i] = pickedWords[i].charAt(0).toUpperCase() + pickedWords[i].slice(1);
      }
    }
  }

  let finalPassphrase = pickedWords.join(sep);

  // Optionally append or insert a number
  if (options.addNumber) {
    const randomNum = getRandomInt(100); // 0-99
    // Append or pre-pend based on a random toggle
    if (getRandomInt(2) === 0) {
      finalPassphrase = randomNum + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + finalPassphrase;
    } else {
      finalPassphrase = finalPassphrase + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + randomNum;
    }
  }

  // Optionally append or insert a symbol
  if (options.addSymbol) {
    const symbols = '!@#$%&*?+-=';
    const randomSymbol = symbols[getRandomInt(symbols.length)];
    if (getRandomInt(2) === 0) {
      finalPassphrase = randomSymbol + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + finalPassphrase;
    } else {
      finalPassphrase = finalPassphrase + (options.separator === 'none' || options.separator === 'camel' ? '' : sep) + randomSymbol;
    }
  }

  return finalPassphrase;
}
