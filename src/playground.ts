import SuperJSON from "superjson";

class Car {
    constructor(
        public make: string,
        public model: string,
    ) {}
}

SuperJSON.registerCustom<Car, { make: string; model: string }>(
    {
        isApplicable: (value): value is Car => value instanceof Car,
        serialize: car => ({ make: car.make, model: car.model }),
        deserialize: attrs => new Car(attrs.make, attrs.model),
    },
    "Car",
);

const carStr = SuperJSON.stringify(new Car("Honda", "Civic"));
console.log("Stringified:", carStr);

const car = SuperJSON.parse(carStr);
console.log("Parsed:", car);

const serialized = SuperJSON.serialize(new Car("Ford", "Focus"));
console.log("Serialized:", serialized);

const deserialized = SuperJSON.deserialize<Car>(serialized);
console.log("Deserialized:", deserialized);
