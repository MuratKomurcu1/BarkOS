import bookshelfUrl from '../../assets/barkos-pixel-office/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png'
import binUrl from '../../assets/barkos-pixel-office/furniture/BIN/BIN.png'
import carpetUrl from '../../assets/barkos-pixel-office/carpets/carpet_1.png'
import char0Url from '../../assets/barkos-pixel-office/characters/char_0.png'
import char1Url from '../../assets/barkos-pixel-office/characters/char_1.png'
import char2Url from '../../assets/barkos-pixel-office/characters/char_2.png'
import char3Url from '../../assets/barkos-pixel-office/characters/char_3.png'
import char4Url from '../../assets/barkos-pixel-office/characters/char_4.png'
import char5Url from '../../assets/barkos-pixel-office/characters/char_5.png'
import clockUrl from '../../assets/barkos-pixel-office/furniture/CLOCK/CLOCK.png'
import coffeeUrl from '../../assets/barkos-pixel-office/furniture/COFFEE/COFFEE.png'
import coffeeTableUrl from '../../assets/barkos-pixel-office/furniture/COFFEE_TABLE/COFFEE_TABLE.png'
import computerOffUrl from '../../assets/barkos-pixel-office/furniture/PC/PC_FRONT_OFF.png'
import computerOn1Url from '../../assets/barkos-pixel-office/furniture/PC/PC_FRONT_ON_1.png'
import computerOn2Url from '../../assets/barkos-pixel-office/furniture/PC/PC_FRONT_ON_2.png'
import computerOn3Url from '../../assets/barkos-pixel-office/furniture/PC/PC_FRONT_ON_3.png'
import chairUrl from '../../assets/barkos-pixel-office/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png'
import deskUrl from '../../assets/barkos-pixel-office/furniture/DESK/DESK_FRONT.png'
import floorUrl from '../../assets/barkos-pixel-office/floors/floor_0.png'
import hangingPlantUrl from '../../assets/barkos-pixel-office/furniture/HANGING_PLANT/HANGING_PLANT.png'
import largePaintingUrl from '../../assets/barkos-pixel-office/furniture/LARGE_PAINTING/LARGE_PAINTING.png'
import plantUrl from '../../assets/barkos-pixel-office/furniture/PLANT/PLANT.png'
import plantLargeUrl from '../../assets/barkos-pixel-office/furniture/LARGE_PLANT/LARGE_PLANT.png'
import smallPaintingUrl from '../../assets/barkos-pixel-office/furniture/SMALL_PAINTING/SMALL_PAINTING.png'
import sofaUrl from '../../assets/barkos-pixel-office/furniture/SOFA/SOFA_BACK.png'
import whiteboardUrl from '../../assets/barkos-pixel-office/furniture/WHITEBOARD/WHITEBOARD.png'
import claudioUrl from '../../assets/barkos-pixel-office/pets/claudio/pet.png'
import gitcatUrl from '../../assets/barkos-pixel-office/pets/gitcat/pet.png'

export type BarkosPixelOfficeImages = {
  characters: HTMLImageElement[]
  floor: HTMLImageElement
  carpet: HTMLImageElement
  desk: HTMLImageElement
  chair: HTMLImageElement
  computerOff: HTMLImageElement
  computerOn: HTMLImageElement[]
  bookshelf: HTMLImageElement
  whiteboard: HTMLImageElement
  clock: HTMLImageElement
  plant: HTMLImageElement
  plantLarge: HTMLImageElement
  sofa: HTMLImageElement
  coffeeTable: HTMLImageElement
  coffee: HTMLImageElement
  bin: HTMLImageElement
  hangingPlant: HTMLImageElement
  smallPainting: HTMLImageElement
  largePainting: HTMLImageElement
  pets: HTMLImageElement[]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`BarkOS ofis görseli yüklenemedi: ${url}`))
    image.src = url
  })
}

export async function loadBarkosPixelOfficeImages(): Promise<BarkosPixelOfficeImages> {
  const [characters, computerOn, floor, carpet, desk, chair, computerOff, bookshelf] =
    await Promise.all([
      Promise.all([char0Url, char1Url, char2Url, char3Url, char4Url, char5Url].map(loadImage)),
      Promise.all([computerOn1Url, computerOn2Url, computerOn3Url].map(loadImage)),
      loadImage(floorUrl),
      loadImage(carpetUrl),
      loadImage(deskUrl),
      loadImage(chairUrl),
      loadImage(computerOffUrl),
      loadImage(bookshelfUrl)
    ])
  const [whiteboard, clock, plant, plantLarge, sofa, coffeeTable, coffee, bin] = await Promise.all([
    loadImage(whiteboardUrl),
    loadImage(clockUrl),
    loadImage(plantUrl),
    loadImage(plantLargeUrl),
    loadImage(sofaUrl),
    loadImage(coffeeTableUrl),
    loadImage(coffeeUrl),
    loadImage(binUrl)
  ])
  const [hangingPlant, smallPainting, largePainting, pets] = await Promise.all([
    loadImage(hangingPlantUrl),
    loadImage(smallPaintingUrl),
    loadImage(largePaintingUrl),
    Promise.all([claudioUrl, gitcatUrl].map(loadImage))
  ])
  return {
    characters,
    floor,
    carpet,
    desk,
    chair,
    computerOff,
    computerOn,
    bookshelf,
    whiteboard,
    clock,
    plant,
    plantLarge,
    sofa,
    coffeeTable,
    coffee,
    bin,
    hangingPlant,
    smallPainting,
    largePainting,
    pets
  }
}
