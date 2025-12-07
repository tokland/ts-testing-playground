import SuperJSON from 'superjson';

type AllExtendT<Args extends any[], T> = {
    [K in keyof Args]: Args[K] extends T ? true : false;
};

type T2 = AllExtendT<[string, number, boolean, Date], JsonValue>;
//type T3 = {[K in T2]: T2[K] extends false ? never : true};
//   ^?

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

class Car {
    constructor(
        public make: string,
        public model: string
    ) {}
}

SuperJSON.registerCustom<Car, { make: string; model: string }>(
    {
        isApplicable: (value): value is Car => {return value instanceof Car},
        serialize: car => {return { make: car.make, model: car.model }},
        deserialize: attrs => {return new Car(attrs.make, attrs.model)}
    },
    'Car'
);

const carStr = SuperJSON.stringify(new Car('Honda', 'Civic'));
console.log('Serialized:', carStr);

const car = SuperJSON.parse(carStr);
console.log('Deserialized:', car);

const serialized = SuperJSON.serialize(new Car('Ford', 'Focus'));
console.log('Serialized (object):', serialized);

const deserialized = SuperJSON.deserialize<Car>(serialized);
console.log('Deserialized (object):', deserialized);
