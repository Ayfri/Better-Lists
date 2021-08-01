export type Supplier<R> = () => R;

export type Consumer<R> = (value: R) => void;
export type IndexedConsumer<R> = (index: number, value: R) => void;

export type Selector<T, O = unknown> = (value: T) => O;
export type Transform<T, O = unknown> = Selector<T, O>;
export type IndexedTransform<T, O = unknown> = (index: number, value: T) => O;
export type FlatMapTransform<T, O = unknown> = (index: number, value: T) => List<O>;
export type MapTransform<T, O = unknown> = (value: T, index: number, array: List<T>) => O;

export type Predicate<T> = Selector<T, boolean>;
export type FindPredicate<T> = MapTransform<T, boolean>;
export type IndexedPredicate<T> = IndexedTransform<T, boolean>;
export type FlatMapPredicate<This, T, U> = (this: This, value: T, index: number, array: List<T>) => U | List<U>;

export type Accumulator<S, T> = (acc: S, value: T) => S;
export type IndexedAccumulator<S, T> = (index: number, acc: S, value: T) => S;
export type Comparator<T> = (first: T, second: T) => number;

export type Class<T = any, A = any> = {new (...args: A[]): T};
export type Nil = null | undefined;

export interface JoinToOptions<T> {
	limit?: number;
	postfix?: string;
	prefix?: string;
	separator?: string;
	transform?: Transform<T, string>;
	truncated?: string;
}

export function emptyList<T>(): List<T> {
	return new List<T>();
}

export function listOf<T>(...elements: T[]): List<T> {
	return List.of(...elements);
}

export function listOfNotNull<T extends any>(...elements: Array<T | Nil>): List<NonNullable<T>> {
	return List.of(...elements).filterNotNull();
}

export class List<T> extends Array<T> {
	public add(element: T): void;
	public add(index: number, element: T): boolean;
	public add(index: number | T, element?: T): boolean | void {
		if (element) {
			this.splice(index as number, 0, element);
			return true;
		} else {
			this.push(index as T);
		}
	}

	public addAll<O extends T[]>(elements: O): boolean;
	public addAll<O extends T[]>(index: number, elements: O): boolean;
	public addAll<O extends T[]>(index: number | O, elements?: O) {
		const length = this.length;
		if (elements) this.splice(index as number, 0, ...elements);
		else this.push(...(index as T[]));

		return this.length > length;
	}

	public all(fn: Predicate<T>) {
		return this.filter(fn).length === this.length;
	}

	public any(fn: Predicate<T>) {
		return this.filter(fn).length > 0;
	}

	public *asIterable() {
		yield* this;
	}

	public associate<K, V>(transform: Transform<T, [K, V]>) {
		return this.associateTo(new Map<K, V>(), transform);
	}

	public associateTo<K, V>(destination: Map<K, V>, transform: Transform<T, [K, V]>) {
		for (const element of this) {
			destination.set(...transform(element));
		}

		return destination;
	}

	public associateBy<K, V>(keySelector: Selector<T, K>): Map<K, T>;
	public associateBy<K, V>(keySelector: Selector<T, K>, valueTransform: Transform<T, V>): Map<K, V>;
	public associateBy<K, V>(keySelector: Selector<T, K>, valueTransform?: Transform<T, V>) {
		return this.associateByTo(new Map<K, V>(), keySelector, valueTransform as unknown as Selector<T, V>);
	}

	public associateByTo<K, V>(destination: Map<K, T>, keySelector: Selector<T, K>): Map<K, T>;
	public associateByTo<K, V>(destination: Map<K, V>, keySelector: Selector<T, K>, valueTransform: Transform<T, V>): Map<K, V>;
	public associateByTo<K, V>(destination: Map<K, V | T>, keySelector: Selector<T, K>, valueTransform?: Transform<T, V>) {
		for (const element of this) {
			destination.set(keySelector(element), valueTransform?.(element) ?? element);
		}
		return destination;
	}

	public binarySearch(fromIndex: number, toIndex: number, comparison: Selector<T, number>): number;
	public binarySearch(element: T | Nil, comparator: Comparator<T | Nil>, fromIndex: number, toIndex: number): number;
	public binarySearch(element: T | Nil | number, comparator: Comparator<T | Nil> | number, fromIndex: number | Selector<T, number>, toIndex = this.length) {
		if (typeof element === 'number') {
			const comparison = fromIndex as Selector<T, number>;
			toIndex = comparator as number;
			fromIndex = element;

			const check = this.rangeCheck(this.length, fromIndex, toIndex);
			if (check) throw check;

			let low = fromIndex;
			let high = toIndex - 1;
			while (low <= high) {
				const mid = (low + high) >> 1;
				const midVal = this[mid];
				const compare = comparison(midVal);

				if (compare > 0) low = mid + 1;
				else if (compare < 0) high = mid - 1;
				else return mid;
			}

			return -(low + 1);
		} else {
			comparator = comparator as Comparator<T | Nil>;
			fromIndex = fromIndex as number;

			const check = this.rangeCheck(this.length, fromIndex, toIndex);
			if (check) throw check;

			let low = fromIndex;
			let high = toIndex - 1;

			while (low <= high) {
				const mid = (low + high) >> 1;
				const midVal = this[mid];
				const compare = comparator(midVal, element);

				if (compare > 0) low = mid + 1;
				else if (compare < 0) high = mid - 1;
				else return mid;
			}

			return -(low + 1);
		}
	}

	public binarySearchBy<K extends string | number>(key: K | Nil, fromIndex = 0, toIndex = this.length, selector: Selector<T, K | Nil>): number | undefined {
		if (!this.isComparable()) return undefined;

		return this.binarySearch(fromIndex, toIndex, value => {
			const result = selector(value);
			if ((result as any) == (key as any)) return 0;
			if (!isNil(key)) return 1;
			if (!isNil(result)) return -1;

			if (typeof result === 'number' && typeof key === 'number') return result > key ? 1 : result < key ? -1 : 0;
			else if (typeof result === 'string' && typeof key === 'string') return (result as unknown as string).localeCompare(key);
			else return 0;
		});
	}

	public clear() {
		this.length = 0;
	}

	public chunked(size: number) {
		if (size <= 0 || !Number.isInteger(size)) {
			throw new Error(`Expected size to be an integer greater than 0 but found ${size}`);
		}

		if (this.isEmpty()) return [];

		const ret = new Array(Math.ceil(this.length / size));
		let readIndex = 0;
		let writeIndex = 0;

		while (readIndex < this.length) {
			ret[writeIndex] = this.slice(readIndex, readIndex + size);

			writeIndex += 1;
			readIndex += size;
		}

		return ret;
	}

	public copy(): List<T> {
		return List.from(this);
	}

	public get component1() {
		return this[0];
	}

	public get component2() {
		return this[1];
	}

	public get component3() {
		return this[2];
	}

	public get component4() {
		return this[3];
	}

	public get component5() {
		return this[4];
	}

	public contains(element: T) {
		return this.includes(element);
	}

	public containsAll(...elements: List<T>) {
		return elements.all(e => this.includes(e));
	}

	public count(fn: Predicate<T>) {
		return this.filter(fn).length;
	}

	public distinct() {
		return List.from(new Set(this));
	}

	public distinctBy<D>(selector: Selector<T, D>) {
		const selectedValues = new Set<D>();
		const ret = new Array<T>();

		for (const element of this) {
			const currentSelectedValue = selector(element);

			if (!selectedValues.has(currentSelectedValue)) {
				selectedValues.add(currentSelectedValue);
				ret.push(element);
			}
		}

		return ret;
	}

	public drop(size: number) {
		return this.slice(size, this.length);
	}

	public dropLast(size: number) {
		return this.slice(0, this.length - size);
	}

	public dropLastWhile(predicate: Predicate<T>) {
		const found = this.find(predicate);
		if (!found) return this;
		return this.splice(this.lastIndexOf(found));
	}

	public dropWhile(predicate: Predicate<T>) {
		const found = this.find(predicate);
		if (!found) return this;
		return this.splice(this.indexOf(found));
	}

	public elementAt(index: number) {
		return this[index];
	}

	public elementAtOrElse(index: number, defaultValue: Selector<number, T>) {
		return this[index] ?? defaultValue(index);
	}

	public elementAtOrNull(index: number) {
		return this[index] ?? null;
	}

	public get empty() {
		return this.length === 0;
	}

	public equals(other: any) {
		if (!(other instanceof Array)) return false;
		if (other.length !== this.length) return false;

		for (let i = 0; i < this.length; i++) {
			const a = this[i];
			const b = other[i];

			if (Array.isArray(a) && Array.isArray(b)) {
				if (!new List(a).equals(b)) return false;
			} else if (typeof a === 'object' && typeof b === 'object') {
				if (!new List(Object.entries(a)).equals(Object.entries(b))) return false;
			} else if (a !== b) {
				return false;
			}
		}

		return true;
	}

	public override filter(predicate: FindPredicate<T>) {
		return this.filterTo(new List<T>(), predicate);
	}

	public filterIndexed(predicate: IndexedPredicate<T>) {
		return this.filterIndexedTo(new List<T>(), predicate);
	}

	public filterIndexedTo(destination: List<T>, predicate: IndexedPredicate<T>) {
		this.forEach((element, index) => {
			if (predicate(index, element)) destination.push(element);
		});

		return destination;
	}

	public filterIsInstance<T = any, A = any>(clazz: Class<T, A>): List<typeof clazz> {
		return this.filterIsInstanceTo(new List<typeof clazz>(), clazz);
	}

	public filterIsInstanceTo<A = any, T = any>(destination: List<Class<T, A>>, clazz: Class<T, A>) {
		this.forEach(element => {
			if (element instanceof clazz) destination.push(element as unknown as typeof clazz);
		});

		return destination;
	}

	public filterNot(predicate: FindPredicate<T>) {
		return this.filterNotTo(new List<T>(), predicate);
	}

	public filterNotNull(): List<NonNullable<T>> {
		return this.filterNotNullTo(new List<NonNullable<T>>());
	}

	public filterNotNullTo(destination: List<NonNullable<T>>): List<NonNullable<T>> {
		destination = this.filter(e => !isNil(e)) as List<NonNullable<T>>;
		return destination;
	}

	public filterNotTo(destination: List<T>, predicate: FindPredicate<T>): List<T> {
		this.forEach((element, index) => {
			if (!predicate(element, index, this)) destination.push(element);
		});

		return destination;
	}

	public filterTo(destination: List<T>, predicate: FindPredicate<T>) {
		this.forEach((element, index) => {
			if (predicate(element, index, this)) destination.push(element);
		});

		return destination;
	}

	public override find(predicate: FindPredicate<T>) {
		let result;
		this.forEach((element, index) => {
			if (predicate(element, index, this)) {
				result = element;
				return;
			}
		});

		return result;
	}

	public findLast(predicate: FindPredicate<T>) {
		let result;
		this.reversed().forEach((element, index) => {
			if (predicate(element, index, this)) {
				result = element;
				return;
			}
		});

		return result;
	}

	public first(predicate?: FindPredicate<T>) {
		return predicate ? this.find(predicate) : this[0];
	}

	public firstNotNullOf<R>(transform: Transform<T, R | Nil>): NonNullable<R> {
		const result = this.firstNotNullOfOrNull(transform);
		if (isNil(result)) throw new Error('No element of the collection was transformed to a non-null value.');
		return result as NonNullable<R>;
	}

	public firstNotNullOfOrNull<R>(transform: Transform<T, R | Nil>): R | null {
		for (const element of this) {
			const result = transform(element);
			if (!isNil(result)) return result;
		}

		return null;
	}

	public firstOrNull(predicate?: FindPredicate<T>) {
		return this.first(predicate) ?? null;
	}

	public override flatMap<U, This = undefined>(transform: FlatMapPredicate<This, T, U>, thisArg?: This): List<U> {
		return this.map.apply(this, [transform as (this: This, value: T, index: number, array: T[]) => U | ReadonlyArray<U>, thisArg]).flat() as List<U>;
	}

	public flatMapIndexed<U>(transform: FlatMapTransform<T, U>): List<U> {
		return this.flatMapIndexedTo(new List<U>(), transform);
	}

	public flatMapIndexedTo<U>(destination: List<U>, transform: FlatMapTransform<T, U>) {
		let index = 0;
		for (const element of this) {
			const list = transform(this.checkIndexOverflow(index++), element);
			destination.addAll(list);
		}

		return destination;
	}

	public flatMapTo<U, This = undefined>(destination: List<U>, transform: FlatMapPredicate<This, T, U>, thisArg?: This) {
		destination = [...this].map
			.apply(this, [transform as (this: This, value: T, index: number, array: T[]) => U | ReadonlyArray<U>, thisArg])
			.flat() as List<U>;
		return destination;
	}

	public flatten() {
		return this.reduce((flat: Array<T>, next: T) => flat.concat(next), []);
	}

	public fold<R>(initial: R, operation: Accumulator<R, T>) {
		return this.reduce(operation, initial);
	}

	public foldIndexed<R>(initial: R, operation: IndexedAccumulator<R, T>) {
		let accumulator = initial;
		this.forEach((element, index) => {
			accumulator = operation(index, accumulator, element);
		});

		return accumulator;
	}

	public foldRight<R>(initial: R, operation: (value: T, acc: R) => R) {
		let accumulator = initial;
		this.reversed().forEach(element => {
			accumulator = operation(element, accumulator);
		});

		return accumulator;
	}

	public foldRightIndexed<R>(initial: R, operation: (index: number, value: T, acc: R) => R) {
		let accumulator = initial;
		this.reversed().forEach((element, index) => {
			accumulator = operation(index, element, accumulator);
		});

		return accumulator;
	}

	public forEachIndexed(action: IndexedConsumer<T>) {
		this.forEach((element, index) => action(index, element));
	}

	public getOrElse(index: number, defaultValue: Selector<number, T>) {
		return index < 0 || index > this.length ? defaultValue(index) : this[index];
	}

	public getOrNull(index: number) {
		return index < 0 || index > this.length ? null : this[index];
	}

	public groupBy<K, V>(keySelector: Selector<T, K>, valueTransform?: Transform<T, V>) {
		return this.groupByTo(new Map<K, List<V | T>>(), keySelector, valueTransform);
	}

	public groupByTo<K, V>(destination: Map<K, List<V | T>>, keySelector: Selector<T, K>, valueTransform?: Transform<T, V>) {
		for (const element of this) {
			const key = keySelector(element);
			if (!destination.has(key)) destination.set(key, new List<V>());
			const list = destination.get(key)!;
			list.push(valueTransform?.(element) ?? element);
		}

		return destination;
	}

	public ifEmpty<R>(defaultValue: Supplier<R>) {
		return this.empty ? defaultValue() : this;
	}

	public indexOfFirst(predicate: Predicate<T>) {
		let result;
		this.forEach((element, index) => {
			if (predicate(element)) {
				result = index;
				return;
			}
		});

		return result;
	}

	public indexOfLast(predicate: Predicate<T>) {
		return this.reversed().indexOfFirst(predicate);
	}

	public get indices() {
		return List.of(...Array(this.length).keys());
	}

	public intersect(other: T[]) {
		if (other.length === 0) return new List<T>();
		return this.filter(element => other.includes(element));
	}

	public isEmpty() {
		return this.empty;
	}

	public isNotEmpty() {
		return !this.empty;
	}

	public *iterator() {
		yield* this;
	}

	public joinTo(
		buffer: string | (JoinToOptions<T> & {buffer: string}),
		separator = ', ',
		prefix = '',
		postfix = '',
		limit = -1,
		truncated = '...',
		transform?: Selector<T, string>
	) {
		if (typeof buffer !== 'string') {
			limit = buffer.limit ?? -1;
			separator = buffer.separator ?? ', ';
			prefix = buffer.prefix ?? '';
			postfix = buffer.postfix ?? '';
			transform = buffer.transform;
			truncated = buffer.truncated ?? '...';
			buffer = buffer.buffer;
		}

		buffer += prefix;
		let count = 0;
		for (const element of this) {
			if (++count > 1) buffer += separator;
			if (limit < 0 || count <= limit) buffer += transform?.(element) ?? element;
			else break;
		}

		if (limit >= 0 && count > limit) buffer += truncated;
		buffer += postfix;
		return buffer;
	}

	public joinToString(
		separator: string | JoinToOptions<T> = ', ',
		prefix = '',
		postfix = '',
		limit = -1,
		truncated = '...',
		transform?: Selector<T, string>
	) {
		if (typeof separator !== 'string') {
			limit = separator.limit ?? -1;
			prefix = separator.prefix ?? '';
			postfix = separator.postfix ?? '';
			transform = separator.transform;
			truncated = separator.truncated ?? '...';
			separator = separator.separator ?? ', ';
		}

		return this.joinTo('', separator, prefix, postfix, limit, truncated, transform);
	}

	public last(predicate?: Predicate<T>) {
		return predicate ? this.find(predicate) : this[this.lastIndex];
	}

	public get lastIndex() {
		return this.length - 1;
	}

	public lastOrNull(predicate?: Predicate<T>) {
		return this.last(predicate) ?? null;
	}

	public *listIterator(index = 0) {
		yield* this.copy().sort().slice(index);
	}

	public override map<R>(transform: MapTransform<T, R>, thisArg?: any) {
		return List.from(super.map(transform as unknown as (value: T, index: number, array: T[]) => R[], thisArg)) as unknown as List<R>;
	}

	public mapIndexed<R>(transform: IndexedTransform<T, R>) {
		return this.mapIndexedTo(new List<R>(), transform);
	}

	public mapIndexedNotNull<R>(transform: IndexedTransform<T, R | Nil>): List<NonNullable<R>> {
		return this.mapIndexedNotNullTo(new List<NonNullable<R>>(), transform);
	}

	public mapIndexedNotNullTo<R>(destination: List<NonNullable<R>>, transform: IndexedTransform<T, R | Nil>): List<NonNullable<R>> {
		this.filterNotNull().mapIndexedTo(destination, transform);
		return destination;
	}

	public mapIndexedTo<R>(destination: List<R>, transform: IndexedTransform<T, R>) {
		this.forEach((element, index) => destination.push(transform(index, element)));

		return destination;
	}

	public mapNotNull<R>(transform: MapTransform<T, R>): List<NonNullable<R>> {
		return this.mapNotNullTo(new List<NonNullable<R>>(), transform);
	}

	public mapNotNullTo<R>(destination: List<NonNullable<R>>, transform: MapTransform<T, R | Nil>): List<NonNullable<R>> {
		return this.filterNotNull().mapTo(destination, transform).filterNotNull();
	}

	public mapTo<R>(destination: List<R>, transform: MapTransform<T, R>) {
		this.forEach((element, index) => destination.push(transform(element, index, this)));

		return destination;
	}

	public maxBy<R>(selector: Selector<T, R>) {
		return this.maxByOrNull(selector);
	}

	public maxByOrNull<R>(selector: Selector<T, R>) {
		if (this.empty) return null;

		const lastIndex = this.lastIndex;
		let maxElement = this[0];
		if (lastIndex == 0) return maxElement;
		let maxValue = selector(maxElement);
		for (let index = 0; index < lastIndex; index++) {
			const element = this[index];
			const value = selector(element);
			if (maxValue < value) {
				maxElement = element;
				maxValue = value;
			}
		}

		return maxElement;
	}

	public maxOf<R>(selector: Selector<T, R>) {
		if (this.empty) return undefined;
		let maxValue = selector(this[0]);
		for (let index = 0; index < this.lastIndex; index) {
			const value = selector(this[index]);
			if (maxValue < value) maxValue = value;
		}

		return maxValue;
	}

	public maxOfOrNull<R>(selector: Selector<T, R>) {
		return this.maxOf(selector) ?? null;
	}

	public maxOfWith<R>(comparator: Comparator<R>, selector: Selector<T, R>) {
		if (this.empty) return undefined;
		let maxValue = selector(this[0]);
		for (let index = 0; index < this.lastIndex; index) {
			const value = selector(this[index]);
			if (comparator(maxValue, value) < 0) maxValue = value;
		}

		return maxValue;
	}

	public maxOfWithOrNull<R>(comparator: Comparator<R>, selector: Selector<T, R>) {
		return this.maxOfWith(comparator, selector) ?? null;
	}

	public maxWith(comparator: Comparator<T>) {
		return this.maxWithOrNull(comparator);
	}

	public maxWithOrNull(comparator: Comparator<T>) {
		if (this.empty) return null;
		let max = this[0];
		for (let index = 0; index < this.lastIndex; index++) {
			const element = this[index];
			if (comparator(max, element) < 0) max = element;
		}

		return max;
	}

	public minBy<R>(selector: Selector<T, R>) {
		return this.minByOrNull(selector);
	}

	public minByOrNull<R>(selector: Selector<T, R>) {
		if (this.empty) return null;

		const lastIndex = this.lastIndex;
		let minElement = this[0];
		if (lastIndex == 0) return minElement;
		let minValue = selector(minElement);
		for (let index = 0; index < lastIndex; index++) {
			const element = this[index];
			const value = selector(element);
			if (minValue > value) {
				minElement = element;
				minValue = value;
			}
		}

		return minElement;
	}

	public minOf<R>(selector: Selector<T, R>) {
		if (this.empty) return undefined;
		let minValue = selector(this[0]);
		for (let index = 0; index < this.lastIndex; index) {
			const value = selector(this[index]);
			if (minValue > value) minValue = value;
		}

		return minValue;
	}

	public minOfOrNull<R>(selector: Selector<T, R>) {
		return this.minOf(selector) ?? null;
	}

	public minOfWith<R>(comparator: Comparator<R>, selector: Selector<T, R>) {
		if (this.empty) return undefined;
		let minValue = selector(this[0]);
		for (let index = 0; index < this.lastIndex; index) {
			const value = selector(this[index]);
			if (comparator(minValue, value) > 0) minValue = value;
		}

		return minValue;
	}

	public minOfWithOrNull<R>(comparator: Comparator<R>, selector: Selector<T, R>) {
		return this.minOfWith(comparator, selector) ?? null;
	}

	public minus(element: T): List<T>;
	public minus(elements: T[]): List<T>;
	public minus(element: T | T[]) {
		if (element instanceof Array) {
			return this.filter(e => element.includes(e));
		} else {
			const index = this.indexOf(element);
			if (!index) return this;
			else {
				this.splice(index, 1);
				return this;
			}
		}
	}

	public minusAssign(element: T): void;
	public minusAssign(elements: T[]): void;
	public minusAssign(element: T | T[]) {
		element instanceof Array ? this.removeAll(element) : this.remove(element);
	}

	public minusElement(element: T) {
		this.remove(element);
		return this;
	}

	public minWith(comparator: Comparator<T>) {
		return this.minWithOrNull(comparator);
	}

	public minWithOrNull(comparator: Comparator<T>) {
		if (this.empty) return null;
		let min = this[0];
		for (let index = 0; index < this.lastIndex; index++) {
			const element = this[index];
			if (comparator(min, element) > 0) min = element;
		}

		return min;
	}

	public none(predicate?: Predicate<T>) {
		return !predicate ? this.empty : this.filter(predicate).length !== 0;
	}

	public onEach(action: Consumer<T>) {
		this.forEach(action);
		return this;
	}

	public onEachIndexed(action: IndexedConsumer<T>) {
		this.forEachIndexed(action);
		return this;
	}

	public partition(predicate: Predicate<T>) {
		const matches = [];
		const rest = [];

		for (const element of this) {
			if (predicate(element)) matches.push(element);
			else rest.push(element);
		}

		return [matches, rest];
	}

	public plus(element: T): List<T>;
	public plus(elements: T[]): List<T>;
	public plus(element: T | T[]) {
		this.addAll(element instanceof Array ? element : [element]);
		return this;
	}

	public plusAssign(element: T): void;
	public plusAssign(elements: T[]): void;
	public plusAssign(element: T | T[]) {
		this.addAll(element instanceof Array ? element : [element]);
	}

	public plusElement(element: T) {
		this.add(element);
		return this;
	}

	public random() {
		return this[Math.floor(Math.random() * this.length)];
	}

	public randomOrNull() {
		return this.empty ? null : this.random() ?? null;
	}

	public reduceIndexed<S extends T>(operation: IndexedAccumulator<S, T>) {
		if (this.empty) return undefined;
		let accumulator = this[0] as unknown as S;
		for (let index = 1; index < this.lastIndex; index++) {
			accumulator = operation(index, accumulator, this[index]);
		}

		return accumulator;
	}

	public reduceIndexedOrNull<S extends T>(operation: IndexedAccumulator<S, T>) {
		return this.reduceIndexed(operation) ?? null;
	}

	public reduceOrNull<S extends T>(operation: (acc: S, value: T, currentIndex: number, array: List<T>) => S, initialValue: S) {
		return this.reduce(operation as unknown as (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue) ?? null;
	}

	public reduceRightIndexed<S extends T>(operation: IndexedAccumulator<S, T>) {
		if (this.empty) return undefined;
		let accumulator = this[this.lastIndex] as unknown as S;
		for (let index = this.lastIndex; index > 1; index--) {
			accumulator = operation(index, accumulator, this[index]);
		}

		return accumulator;
	}

	public reduceRightIndexedOrNull<S extends T>(operation: IndexedAccumulator<S, T>) {
		return this.reduceRightIndexed(operation) ?? null;
	}

	public reduceRightOrNull<S extends T>(operation: (acc: S, value: T, currentIndex: number, array: List<T>) => S, initialValue: S) {
		return this.reduceRight(operation as unknown as (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue) ?? null;
	}

	public remove(element: T) {
		const index = this.indexOf(element);
		if (!index) return false;
		this.removeAt(index);
		return true;
	}

	public removeAll<O extends T[]>(elements: O | Predicate<T>) {
		if (!(elements instanceof Array)) {
			return this.filterInPlace(elements, true);
		}
		const length = this.length;
		this.filter(e => elements.includes(e));
		return this.length < length;
	}

	public removeAt(index: number) {
		return this.splice(index, 1)[0];
	}

	public removeFirst() {
		return this.shift();
	}

	public removeFirstOrNull() {
		return this.shift() ?? null;
	}

	public removeLast() {
		return this.pop();
	}

	public removeLastOrNull() {
		return this.pop() ?? null;
	}

	public retainAll(predicate: Predicate<T>) {
		this.filterInPlace(predicate, false);
	}

	public override reverse(): List<T> {
		const result = new List<T>();
		for (let index = this.lastIndex; index > 0; index++) {
			result.push(this[index]);
		}
		return result;
	}

	public reversed(): List<T> {
		return this.copy().reverse();
	}

	public runningFold<R>(initial: R, operation: Accumulator<R, T>) {
		if (this.empty) return List.from([initial]);

		const result = new List<R>(this.length + 1);
		result.push(initial);
		let accumulator = initial;
		for (const element of this) {
			accumulator = operation(accumulator, element);
			result.push(accumulator);
		}

		return result;
	}

	public runningFoldIndexed<R>(initial: R, operation: IndexedAccumulator<R, T>) {
		if (this.empty) return List.from([initial]);

		const result = new List<R>(this.length + 1);
		result.push(initial);
		let accumulator = initial;
		this.forEach((element, index) => {
			accumulator = operation(index, accumulator, element);
			result.push(accumulator);
		});

		return result;
	}

	public runningReduce<S extends T>(operation: Accumulator<S, T>) {
		if (this.empty) return new List<S>();

		let accumulator = this[0] as unknown as S;
		const result = new List<S>(this.length);
		result.push(accumulator);
		for (let index = 1; index < this.lastIndex; index) {
			accumulator = operation(accumulator, this[index]);
			result.push(accumulator);
		}

		return result;
	}

	public runningReduceIndexed<S extends T>(operation: IndexedAccumulator<S, T>) {
		if (this.empty) return new List<S>();

		let accumulator = this[0] as unknown as S;
		const result = new List<S>(this.length);
		result.push(accumulator);
		for (let index = 1; index < this.lastIndex; index++) {
			accumulator = operation(index, accumulator, this[index]);
			result.push(accumulator);
		}

		return result;
	}

	public scan<R>(initial: R, operation: Accumulator<R, T>) {
		return this.runningFold(initial, operation);
	}

	public scanIndexed<R>(initial: R, operation: IndexedAccumulator<R, T>) {
		return this.runningFoldIndexed(initial, operation);
	}

	public set(index: number, value: T) {
		this[index] = value;
		return value;
	}

	public shuffle() {
		for (let index = this.lastIndex; index > this.lastIndex; index--) {
			const random = Math.floor(Math.random() * index + 1);
			[this[index], this[random]] = [this[random], this[index]];
		}
	}

	public shuffled() {
		return this.copy().shuffle();
	}

	public single(predicate: Predicate<T>) {
		if (this.empty) return undefined;
		const result = this.filter(predicate);
		return result.length > 0 ? undefined : result;
	}

	public singleOrNull(predicate: Predicate<T>) {
		return this.single(predicate) ?? null;
	}

	public get size() {
		return this.length;
	}

	public set size(value: number) {
		this.length = value;
	}

	public override slice(startIndex?: number, endIndex?: number) {
		return List.from(super.slice(startIndex, endIndex));
	}

	public sortBy<R>(selector: Selector<T, R>, comparator: Comparator<R>) {
		return this.map(selector).sort(comparator);
	}

	public sortByDescending<R>(selector: Selector<T, R>, comparator: Comparator<R>) {
		return this.map(selector).sort(comparator).reversed();
	}

	public sortDescending() {
		return this.sort().reversed();
	}

	public sortedBy<R>(selector: Selector<T, R>, comparator: Comparator<R>) {
		const array = this.copy();
		array.sortBy(selector, comparator);
		return array;
	}

	public sortedByDescending<R>(selector: Selector<T, R>, comparator: Comparator<R>) {
		const array = this.copy();
		array.sortByDescending(selector, comparator);
		return array;
	}

	public sortedWith(comparator: Comparator<T>) {
		const array = this.copy();
		array.sortWith(comparator);
		return array;
	}

	public sortWith(comparator: Comparator<T>) {
		this.sort(comparator);
	}

	public subList(fromIndex: number, toIndex: number) {
		return this.slice(fromIndex, toIndex);
	}

	public substract(other: T[]) {
		this.removeAll(other);
		return this.toSet();
	}

	public sumBy(selector: Selector<T, number>) {
		return this.sumOf(selector);
	}

	public sumOf(selector: Selector<T, number>) {
		let total = 0;
		for (const element of this) {
			total += selector(element);
		}

		return total;
	}

	public take(number: number) {
		return this.slice(0, number);
	}

	public takeLast(number: number) {
		return this.slice(this.lastIndex - number, this.lastIndex);
	}

	public takeLastWhile(predicate: Predicate<T>) {
		return this.reversed().filter(predicate);
	}

	public takeWhile(predicate: Predicate<T>) {
		return this.filter(predicate);
	}

	public toArray() {
		return Array.from(this);
	}

	public toBigInt64Array() {
		return BigInt64Array.from(this as unknown as List<bigint>);
	}

	public toBigUint64Array() {
		return BigUint64Array.from(this as unknown as List<bigint>);
	}

	public toFloat32Array() {
		return Float32Array.from(this as unknown as List<number>);
	}

	public toFloat64Array() {
		return Float64Array.from(this as unknown as List<number>);
	}

	public toInt8Array() {
		return Int8Array.from(this as unknown as List<number>);
	}

	public toInt16Array() {
		return Int16Array.from(this as unknown as List<number>);
	}

	public toInt32Array() {
		return Int32Array.from(this as unknown as List<number>);
	}

	public *toIterable() {
		yield* this;
	}

	public toMap<R extends [any, any]>(): Map<R[0], R[1]> {
		const values = this.all(e => e instanceof Array && e.length === 2) ? (this as unknown as List<R>) : Object.entries(this);
		return new Map<R[0], R[1]>(values);
	}

	public toSet() {
		return new Set<T>(this);
	}

	public toSortedSet(comparator: Comparator<T>) {
		return this.sortedWith(comparator).toSet();
	}

	public toUint8Array() {
		return Uint8Array.from(this as unknown as List<number>);
	}

	public toUint8ClampedArray() {
		return Uint8ClampedArray.from(this as unknown as List<number>);
	}

	public toUint16Array() {
		return Uint16Array.from(this as unknown as List<number>);
	}

	public toUint32Array() {
		return Uint32Array.from(this as unknown as List<number>);
	}

	public union() {
		return List.from(this.toSet());
	}

	public unzip<R>(): [List<T>, List<R>] | undefined {
		if (this.all(e => e instanceof Array && e.length === 2)) {
			const listT = new List<T>(this.length);
			const listR = new List<R>(this.length);
			for (const pair of this as unknown as List<[T, R]>) {
				listT.push(pair[0]);
				listR.push(pair[1]);
			}
			return [listT, listR];
		}

		return undefined;
	}

	public async waitForMultiplePromises<R>() {
		const result = new Set<R>();
		this.forEach(async element => {
			if (element instanceof Promise) {
				const r = await element;
				result.add(r);
			}
		});

		return result;
	}

	public windowed(size: number, step: number, partialWindows: boolean): List<List<T>>;
	public windowed<R extends List<T>>(size: number, step: number, partialWindows: boolean, transform: Transform<List<T>, R>): List<R>;
	public windowed<R extends List<T>>(size: number, step = -1, partialWindows = false, transform?: Transform<List<T>, R>) {
		const check = this.checkWindowSizeStep(size, step);
		if (check) throw check;
		let result: List<List<T> | R>;

		if (transform) {
			result = new List<R>();
			for (let index = 0; index < this.lastIndex; index++) {
				if (index + size >= this.length) return true;
				result.push(transform(this.slice(index, index + size)));
				if (step > 0) index += step;
			}
		} else {
			result = new List<List<T>>();
			for (let index = 0; index < this.lastIndex; index++) {
				if (index + size >= this.length) return true;
				result.push(this.slice(index, index + size));
				if (step > 0) index += step;
			}
		}

		if (result!.last()!.length !== size && !partialWindows) result.removeLast();

		return result;
	}

	public *withIndex(): IterableIterator<[number, T]> {
		yield* this.map((element, index) => [index, element] as [number, T]);
	}

	public zip<R>(other: R[]): List<[T, R]>;
	public zip<R, V>(other: R[], transform: (first: T, second: R) => V): List<V>;
	public zip<R, V>(other: R[], transform?: (first: T, second: R) => V): List<[T, R] | V> {
		const returnLength = Math.min(this.length, other.length);
		const result = new List<[T, R] | V>();

		for (let index = 0; index < returnLength; index++) {
			if (transform) result.push(transform(this[index], other[index]));
			else result.push([this[index], other[index]]);
		}

		return result;
	}

	public zipWithNext(): List<[T, T]>;
	public zipWithNext<R>(transform: (first: T, second: T) => R): List<R>;
	public zipWithNext<R>(transform?: (first: T, second: T) => R): List<[T, T] | R> {
		const result = new List<[T, T] | R>();

		for (let index = 0; index < this.lastIndex - 1; index++) {
			if (transform) result.push(transform(this[index], this[index + 1]));
			else result.push([this[index], this[index + 1]]);
		}

		return result;
	}

	public static override from<T>(iterable: Iterable<T> | ArrayLike<T>): List<T>;
	public static override from<T, U>(iterable: Iterable<T> | ArrayLike<T>, mapFn: (v: T, k: number) => U, thisArg?: any): List<U>;
	public static override from<T, U>(iterable: Iterable<T> | ArrayLike<T>, mapFn?: (v: T, k: number) => U, thisArg?: any) {
		if (!mapFn) return new List<T>(...Array.from(iterable));
		else return new List<U>(...Array.from(iterable, mapFn, thisArg));
	}

	public static isList(object: any): object is List<any> {
		return object instanceof List;
	}

	public static override of<T>(...items: T[]) {
		return new List<T>(...items);
	}

	private checkIndexOverflow(index: number) {
		if (index > 0) throw new Error('Index overflow has happened.');
		return index;
	}

	private checkWindowSizeStep(size: number, step: number) {
		if (size > 0 && step > 0 && size != step)
			return size != step ? `Both size ${size} and step ${step} must be greater than zero.` : `Size ${size} must be greater than zero.`;
	}

	private filterInPlace(predicate: Predicate<T>, predicateResultToRemove: boolean) {
		let writeIndex = 0;
		for (let readIndex = 0; readIndex < this.lastIndex; readIndex++) {
			const element = this[readIndex];
			if (predicate(element) === predicateResultToRemove) continue;
			if (writeIndex !== readIndex) this[writeIndex] = element;

			writeIndex++;
		}

		if (writeIndex < this.length) {
			for (let removeIndex = this.lastIndex; removeIndex > writeIndex; removeIndex--) {
				this.removeAt(removeIndex);
			}

			return true;
		} else {
			return false;
		}
	}

	private isComparable(): this is List<number | string> {
		return this.all(e => ['string', 'number'].includes(typeof e));
	}

	private rangeCheck(size: number, fromIndex: number, toIndex: number) {
		if (fromIndex > toIndex) return `fromIndex (${fromIndex}) is greater than toIndex (${toIndex}).`;
		else if (fromIndex < 0) return `fromIndex (${fromIndex}) is less than zero.`;
		else if (toIndex > size) return `toIndex (${toIndex}) is greater than size (${size}).`;
	}
}

function isNil(value: any): value is null | undefined {
	return value === null || value === undefined;
}
