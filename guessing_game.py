import random

def guess_the_number():
    print("welcome to the number guessing game!")
    print("i'm thinking of a number between 1 and 100.")
    
    # generate a random number between 1 and 100
    secret_number = random.randint(1, 100)
    attempts = 0
    
    while True:
        try:
            # get user input
            guess = int(input("enter your guess: "))
            attempts += 1
            
            # check if the guess is correct
            if guess == secret_number:
                print(f"congratulations! you guessed the number in {attempts} attempts!")
                break
            elif guess < secret_number:
                print("too low! try again.")
            else:
                print("too high! try again.")
                
        except ValueError:
            print("please enter a valid number.")

if __name__ == "__main__":
    guess_the_number()
