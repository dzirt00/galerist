import { expect, it, describe } from 'vitest'
import { determineWinners } from "../src";
import { acquiredArtworkCountWin, allWin, assistantsInPlayCountWin, galleryVisitorCountWin, nextWin, onePlayer, player10, player7, player8, player9, soleLeaderCoins } from "./fixtures";
import { PlayerId, WinnerCandidate } from "../src";
it('expect soleLeaderCoins',() => {
  const dw = determineWinners(soleLeaderCoins)
  expect(dw).toStrictEqual(['player-4'])
})

it('expect acquiredArtworkCountWin',() => {
  const dw = determineWinners(acquiredArtworkCountWin)
  expect(dw).toStrictEqual(['player-5'])
})

it('expect galleryVisitorCountWin',() => {
  const dw = determineWinners(galleryVisitorCountWin)
  expect(dw).toStrictEqual(['player-6'])
})

it('expect galleryVisitorCountWin',() => {
  const dw = determineWinners(assistantsInPlayCountWin)
  expect(dw).toStrictEqual(['player-7'])
})


it('expect allWin',() => {
  const dw = determineWinners(allWin)
  expect(dw).toStrictEqual(['player-10', 'player-9', 'player-7', 'player-8'])

})

it('expect don have player-13',() => {
  const dw = determineWinners(nextWin)
  expect(dw).toStrictEqual(['player-11', 'player-12'])
})


describe('determineWinners — параметризованная проверка сохранения порядка (2, 3, 4 игрока)', () => {
  // Шаблон данных для создания идентичных игроков-победителей
  const baseWinnerData = {
    coins: 100,
    acquiredArtworkCount: 4,
    galleryVisitorCount: 15,
    assistantsInPlayCount: 3,
  };

  it.each([
    {
      playerCount: 2,
      candidates: [
        { playerId: 'player_A' as PlayerId, ...baseWinnerData },
        { playerId: 'player_B' as PlayerId, ...baseWinnerData },
      ],
      expectedOrder: ['player_A', 'player_B'],
    },
    {
      playerCount: 3,
      candidates: [
        { playerId: 'player_X' as PlayerId, ...baseWinnerData },
        { playerId: 'player_Y' as PlayerId, ...baseWinnerData },
        { playerId: 'player_Z' as PlayerId, ...baseWinnerData },
      ],
      expectedOrder: ['player_X', 'player_Y', 'player_Z'],
    },
    {
      playerCount: 4,
      candidates: [
        { playerId: 'player_1' as PlayerId, ...baseWinnerData },
        { playerId: 'player_2' as PlayerId, ...baseWinnerData },
        { playerId: 'player_3' as PlayerId, ...baseWinnerData },
        { playerId: 'player_4' as PlayerId, ...baseWinnerData },
      ],
      expectedOrder: ['player_1', 'player_2', 'player_3', 'player_4'],
    },
  ])(
    'должен сохранять порядок для $playerCount участников при ничьей',
    ({ candidates, expectedOrder }) => {
      const result = determineWinners(candidates);

      // Проверяем, что вернулись все игроки и строго в исходном порядке
      expect(result).toEqual(expectedOrder);
    }
  );
});

describe('determineWinners — отклонение невалидных входных данных', () => {
  // Базовый корректный кандидат для создания тестовых данных
  const validCandidate = (id: string): WinnerCandidate => ({
    playerId: id as PlayerId,
    coins: 10,
    acquiredArtworkCount: 1,
    galleryVisitorCount: 1,
    assistantsInPlayCount: 1,
  });

  describe('1. Валидация структуры и размера массива candidates', () => {
    it.each([
      { title: 'null вместо массива', input: null as any, error: 'Turn cannot determine a winner' },
      { title: 'undefined вместо массива', input: undefined as any, error: 'Turn cannot determine a winner' },
      { title: 'пустой массив (0 игроков)', input: [], error: 'Turn cannot determine a winner' },
      {
        title: 'слишком много участников (5 игроков)',
        input: [validCandidate('1'), validCandidate('2'), validCandidate('3'), validCandidate('4'), validCandidate('5')],
        error: 'Turn cannot determine a winner',
      },
    ])('должен выбрасывать ошибку на $title', ({ input, error }) => {
      expect(() => determineWinners(input)).toThrow(error);
    });
  });

  describe('2. Валидация уникальности PlayerId', () => {
    it('должен выбрасывать ошибку, если playerId дублируются', () => {
      const candidates = [
        validCandidate('player_A'),
        validCandidate('player_B'),
        validCandidate('player_A'), // Дубликат ID
      ];

      expect(() => determineWinners(candidates)).toThrow('Duplicate playerId found: player_A');
    });
  });

  describe('3. Валидация некорректных метрик игроков', () => {
    it.each([
      // Отрицательные значения
      { prop: 'coins', value: -1, desc: 'отрицательные монеты' },
      { prop: 'acquiredArtworkCount', value: -5, desc: 'отрицательные картины' },
      { prop: 'galleryVisitorCount', value: -10, desc: 'отрицательные посетители' },
      { prop: 'assistantsInPlayCount', value: -2, desc: 'отрицательные ассистенты' },

      // Нецелые числа (Дроби)
      { prop: 'coins', value: 10.5, desc: 'дробные монеты' },
      { prop: 'galleryVisitorCount', value: 3.14, desc: 'дробные посетители' },

      // Не числовые типы (NaN, строки, булевы значения, null)
      { prop: 'coins', value: NaN, desc: 'NaN монеты' },
      { prop: 'acquiredArtworkCount', value: '3' as any, desc: 'строка вместо картин' },
      { prop: 'galleryVisitorCount', value: true as any, desc: 'boolean вместо посетителей' },
      { prop: 'assistantsInPlayCount', value: null as any, desc: 'null вместо ассистентов' },

      // Превышение безопасного максимума
      { prop: 'coins', value: Number.MAX_SAFE_INTEGER + 1, desc: 'значение больше MAX_SAFE_INTEGER' },
    ])('должен выбрасывать ошибку, если у игрока $desc ($prop = $value)', ({ prop, value }) => {
      // Создаем одного валидного игрока и одного с дефектом
      const candidateWithInvalidMetric = {
        ...validCandidate('player_broken'),
        [prop]: value,
      };

      const candidates = [validCandidate('player_valid'), candidateWithInvalidMetric];

      expect(() => determineWinners(candidates)).toThrow(
        `Invalid metric value: ${value}. Must be a safe, non-negative integer.`
      );
    });
  });
});

describe('determineWinners — иммутабельность входных данных', () => {
  // Функция-фабрика для получения свежего массива кандидатов перед каждым тестом
  const createFreshCandidates = (): WinnerCandidate[] => [
    { playerId: 'player_A' as PlayerId, coins: 50, acquiredArtworkCount: 2, galleryVisitorCount: 5, assistantsInPlayCount: 1 },
    { playerId: 'player_B' as PlayerId, coins: 100, acquiredArtworkCount: 4, galleryVisitorCount: 10, assistantsInPlayCount: 2 },
  ];

  describe('При успешном выполнении', () => {
    it('не должен мутировать и не должен замораживать исходный массив candidates', () => {
      const candidates = createFreshCandidates();

      // Делаем глубокий снимок состояния до вызова функции
      const snapshotBefore = JSON.stringify(candidates);

      // Вызываем тестируемую функцию
      determineWinners(candidates);

      // 1. Проверяем, что элементы массива и их порядок не изменились
      expect(JSON.stringify(candidates)).toBe(snapshotBefore);

      // 2. Проверяем, что исходный массив ОСТАЛСЯ изменяемым (не заморожен)
      expect(Object.isFrozen(candidates)).toBe(false);

      // Дополнительный тест: можем ли мы по-прежнему модифицировать исходный массив?
      expect(() => {
        (candidates as any).push({ playerId: 'player_C' });
      }).not.toThrow();
    });
  });

  describe('При возникновении ошибки', () => {
    it('не должен мутировать и не должен замораживать массив candidates, если валидация провалена', () => {
      // Создаем массив, где у второго игрока невалидные монеты (-10), что вызовет ошибку
      const candidates = createFreshCandidates();
      candidates[1]!.coins = -10;

      const snapshotBefore = JSON.stringify(candidates);

      // Убеждаемся, что функция выбрасывает ошибку
      expect(() => determineWinners(candidates)).toThrow();

      // 1. Проверяем, что даже при аварийном выходе данные внутри не изменились
      expect(JSON.stringify(candidates)).toBe(snapshotBefore);

      // 2. Проверяем, что массив не был заморожен в процессе валидации
      expect(Object.isFrozen(candidates)).toBe(false);
    });
  });
});


it('Новый замороженный результат при каждом вызове', () => {
  const dw1 = determineWinners(galleryVisitorCountWin)
  const dw2 = determineWinners(galleryVisitorCountWin)

  expect(Object.isFrozen(dw1)).toBe(true)
  expect(Object.isFrozen(dw2)).toBe(true)
  expect(dw1).not.toBe(dw2);
  expect(dw1).toEqual(dw2);
});

it('ошибка при 1 игроке',() =>{
  expect(()=> determineWinners(onePlayer)).toThrow('Turn cannot determine a winner')
})
