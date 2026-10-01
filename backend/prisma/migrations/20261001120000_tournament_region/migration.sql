-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "district" TEXT,
ADD COLUMN     "region" TEXT;


-- existing tournaments: the region of their city
UPDATE "tournaments" SET "region" = 'astana' WHERE "region" IS NULL AND "city" IN ('Астана');
UPDATE "tournaments" SET "region" = 'almaty' WHERE "region" IS NULL AND "city" IN ('Алматы');
UPDATE "tournaments" SET "region" = 'shymkent' WHERE "region" IS NULL AND "city" IN ('Шымкент');
UPDATE "tournaments" SET "region" = 'abai' WHERE "region" IS NULL AND "city" IN ('Семей', 'Аягоз', 'Курчатов', 'Шар');
UPDATE "tournaments" SET "region" = 'akmola' WHERE "region" IS NULL AND "city" IN ('Кокшетау', 'Степногорск', 'Щучинск', 'Атбасар', 'Акколь', 'Есиль', 'Ерейментау', 'Макинск', 'Степняк', 'Державинск', 'Косшы');
UPDATE "tournaments" SET "region" = 'aktobe' WHERE "region" IS NULL AND "city" IN ('Актобе', 'Алга', 'Кандыагаш', 'Хромтау', 'Шалкар', 'Эмба', 'Темир', 'Жем');
UPDATE "tournaments" SET "region" = 'almaty_region' WHERE "region" IS NULL AND "city" IN ('Конаев', 'Каскелен', 'Талгар', 'Есик');
UPDATE "tournaments" SET "region" = 'atyrau' WHERE "region" IS NULL AND "city" IN ('Атырау', 'Кульсары');
UPDATE "tournaments" SET "region" = 'east' WHERE "region" IS NULL AND "city" IN ('Усть-Каменогорск', 'Риддер', 'Алтай', 'Зайсан', 'Серебрянск', 'Шемонаиха');
UPDATE "tournaments" SET "region" = 'zhambyl' WHERE "region" IS NULL AND "city" IN ('Тараз', 'Жанатас', 'Каратау', 'Шу');
UPDATE "tournaments" SET "region" = 'zhetysu' WHERE "region" IS NULL AND "city" IN ('Талдыкорган', 'Жаркент', 'Текели', 'Ушарал', 'Уштобе', 'Сарканд');
UPDATE "tournaments" SET "region" = 'west' WHERE "region" IS NULL AND "city" IN ('Уральск', 'Аксай');
UPDATE "tournaments" SET "region" = 'karaganda' WHERE "region" IS NULL AND "city" IN ('Караганда', 'Темиртау', 'Балхаш', 'Шахтинск', 'Сарань', 'Абай', 'Приозёрск');
UPDATE "tournaments" SET "region" = 'kostanay' WHERE "region" IS NULL AND "city" IN ('Костанай', 'Рудный', 'Лисаковск', 'Аркалык', 'Житикара', 'Тобыл');
UPDATE "tournaments" SET "region" = 'kyzylorda' WHERE "region" IS NULL AND "city" IN ('Кызылорда', 'Аральск', 'Казалинск', 'Байконыр');
UPDATE "tournaments" SET "region" = 'mangystau' WHERE "region" IS NULL AND "city" IN ('Актау', 'Жанаозен', 'Форт-Шевченко');
UPDATE "tournaments" SET "region" = 'pavlodar' WHERE "region" IS NULL AND "city" IN ('Павлодар', 'Экибастуз', 'Аксу');
UPDATE "tournaments" SET "region" = 'north' WHERE "region" IS NULL AND "city" IN ('Петропавловск', 'Булаево', 'Мамлютка', 'Сергеевка', 'Тайынша');
UPDATE "tournaments" SET "region" = 'turkistan' WHERE "region" IS NULL AND "city" IN ('Туркестан', 'Кентау', 'Сарыагаш', 'Арысь', 'Ленгер', 'Жетысай', 'Шардара');
UPDATE "tournaments" SET "region" = 'ulytau' WHERE "region" IS NULL AND "city" IN ('Жезказган', 'Сатпаев', 'Каражал');
