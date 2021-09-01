import { readFileSync, writeFileSync, appendFileSync } from 'fs';

const write = ((filename) => {
    writeFileSync(filename, '', 'utf8');
    return (data: string) => appendFileSync(filename, data + '\n', 'utf8');
})('output.txt');

interface Distances {
    [cityId: string]: {
        [cityId: string]: number[];
    };
}

type Path = {
    cityId: string;
    distance: number;
}[];

function main() {
    const storesStr = readFileSync('stores.txt', 'utf8');
    const destinationsStr = readFileSync('destinations.txt', 'utf8');
    const distancesStr = readFileSync('distances.txt', 'utf8');

    const citiesData = prepareCitiesData(storesStr, destinationsStr);
    const { cityIds, storeIds, destinationIds } = citiesData;
    const distances = prepareBackwardDistanceList(distancesStr);

    for (const dst of destinationIds) {
        try {
            const result = findNearestStore(dst, cityIds, storeIds, distances);
            const { storeId, pathLength, path } = result;

            const pathStr = path
                .flatMap(({ cityId, distance }) => [cityId, distance])
                .slice(0, -1)
                .join(' -> ');

            write(dst);
            write(`store: ${storeId}`);
            write(`distance: ${pathLength}`);
            write(`path: ${pathStr}\n`);
        } catch (e) {
            write(e.message + '\n');
        }
    }
}

function prepareCitiesData(storesStr: string, destinationsStr: string) {
    const cityData = storesStr
        .split(/\r?\n/)
        .map((line) => line.split(/(?<=")\s/, 2));

    const cityIds = cityData.map(([id]) => id);

    const storeIds = cityData
        .filter(([_id, isStore]) => isStore !== '0')
        .map(([id]) => id);

    const destinationIds = destinationsStr
        .split(/\r?\n/)
        .map((line) => {
            const [id, isStore] = line.split(/(?<=")\s/, 2);
            return isStore !== '0' ? id : null;
        })
        .filter((id): id is string => id !== null);

    return { cityIds, storeIds, destinationIds };
}

/**
 * Формирует словарь расстояний между концом и началом дороги начиная с конца.
 * Такой порядок выбран, чтобы в дальнейшем искать путь двигаясь от пунктов доставки к складам.
 * @param distancesStr текст, в котором каждая строка является тройкой: <id начала> <id конца> <расстояние>
 * @returns объект-словарь расстояний между городами с элементами вида distances[dst][src],
 *      где dst - id конца дороги, src - id начала, distances[dst][src] - расстояние от src до dst.
 */
function prepareBackwardDistanceList(distancesStr: string): Distances {
    const distances = distancesStr
        .split(/\r?\n/)
        .map((line) => {
            const [src, dst, dist] = line.split(/(?<=")\s/, 3);
            return [src, dst, parseInt(dist)] as const;
        })
        .reduce((distList, [src, dst, dist]) => {
            const value = distList[dst] ?? {};
            value[src] = value[src] ?? [];
            value[src].push(dist);
            distList[dst] = value;
            return distList;
        }, {} as Distances);

    for (const dst of Object.values(distances)) {
        for (const distances of Object.values(dst)) {
            distances.sort();
        }
    }

    return distances;
}

interface DijkstraNode {
    id: string;
    weight: number;
    isVisited?: boolean;
    prev?: DijkstraNode;
}

function dijkstra(
    src: string,
    nodes: string[],
    weights: Distances
): { [key: string]: DijkstraNode } {
    const data: { [id: string]: DijkstraNode } = Object.fromEntries(
        nodes.map((id) => {
            const node = { id, weight: Number.POSITIVE_INFINITY };
            return [id, node] as const;
        })
    );

    let minNode = data[src];
    minNode.weight = 0;

    while (!minNode.isVisited && minNode.weight < Number.POSITIVE_INFINITY) {
        minNode.isVisited = true;

        for (const [id, [weight]] of Object.entries(weights[minNode.id])) {
            const node = data[id];
            if (!node.isVisited && node.weight > minNode.weight + weight) {
                node.weight = minNode.weight + weight;
                node.prev = minNode;
            }
        }

        minNode = Object.values(data).reduce((min, node) => {
            if (min.isVisited) {
                return node;
            }
            return !node.isVisited && min.weight > node.weight ? node : min;
        });
    }

    return data;
}

/**
 * Ищет ближайший склад для указанного города
 * @param destinationId город, для которого нужно найти ближайший склад
 * @param cityIds список id всех городов
 * @param storeIds список id всех складов
 * @param backwardDistances словарь расстояний между городами подобный тому,
 *      что возвращает функция @see prepareBackwardDistanceList
 * @returns объект с тремя сущностями:
 *      storeId - id города с ближайшим складом
 *      pathLength - общая длина пути от склада
 *      path - путь от склада до места доставки с длинами промеждутков
 */
function findNearestStore(
    destinationId: string,
    cityIds: string[],
    storeIds: string[],
    backwardDistances: Distances
): { storeId: string; pathLength: number; path: Path } {
    const data = dijkstra(destinationId, cityIds, backwardDistances);

    const nearest = storeIds
        .map((storeName) => data[storeName])
        .reduce((nearest, store) =>
            nearest.weight > store.weight ? store : nearest
        );

    if (!Number.isFinite(nearest.weight)) {
        throw new Error(`${destinationId}: path not found`);
    }

    const path: Path = [];
    for (let cur = nearest; cur.prev; cur = cur.prev) {
        const dist = backwardDistances[cur.id][cur.prev.id][0];
        path.push({ cityId: cur.id, distance: dist });
    }
    path.push({ cityId: destinationId, distance: 0 });

    return {
        storeId: nearest.id,
        pathLength: nearest.weight,
        path: path,
    };
}

main();
