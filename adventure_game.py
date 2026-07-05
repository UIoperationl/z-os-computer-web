import random
import time

def print_pause(message):
    print(message)
    time.sleep(1.5)

def intro():
    print_pause("you find yourself standing in a field with a dark forest to the north.")
    print_pause("you see a flickering light in the distance.")
    print_pause("what do you do?")
    print_pause("1. go north into the forest.")
    print_pause("2. walk towards the flickering light.")
    print_pause("3. stay where you are.")
    choice = input("enter your choice (1, 2, or 3): ")
    return choice

def forest_path():
    print_pause("\nyou venture into the dark forest.")
    print_pause("the trees loom over you, blocking the moonlight.")
    print_pause("you hear a rustling in the bushes ahead.")
    print_pause("what do you do?")
    print_pause("1. investigate the rustling.")
    print_pause("2. turn back.")
    choice = input("enter your choice (1 or 2): ")
    return choice

def flickering_light():
    print_pause("\nyou walk towards the flickering light.")
    print_pause("as you get closer, you realize it's a campfire.")
    print_pause("a friendly-looking traveler is sitting beside it.")
    print_pause("'traveler: 'hey there, traveler! want to sit by the fire?'")
    print_pause("what do you do?")
    print_pause("1. sit by the fire.")
    print_pause("2. keep walking.")
    choice = input("enter your choice (1 or 2): ")
    return choice

def stay_put():
    print_pause("\nyou decide to stay where you are.")
    print_pause("after a while, you get bored and fall asleep.")
    print_pause("when you wake up, you're still in the same field.")
    print_pause("nothing has changed.")
    print_pause("game over. you're stuck in a loop.")

def game_over():
    print_pause("\ngame over.")
    play_again = input("do you want to play again? (yes/no): ")
    if play_again.lower() == 'yes':
        print_pause("\nstarting a new game...")
        play_game()
    else:
        print_pause("thanks for playing!")

def play_game():
    choice = intro()
    if choice == '1':
        path_choice = forest_path()
        if path_choice == '1':
            print_pause("\nyou investigate the rustling.")
            print_pause("it's just a friendly squirrel!")
            print_pause("the squirrel leads you to a hidden path.")
            print_pause("you follow it and find a treasure chest!")
            print_pause("you win!")
            game_over()
        elif path_choice == '2':
            print_pause("\nyou turn back.")
            print_pause("you're back at the field.")
            game_over()
    elif choice == '2':
        light_choice = flickering_light()
        if light_choice == '1':
            print_pause("\nyou sit by the fire with the traveler.")
            print_pause("they share stories and give you a map.")
            print_pause("the map leads you to a hidden treasure!")
            print_pause("you win!")
            game_over()
        elif light_choice == '2':
            print_pause("\nyou keep walking past the campfire.")
            print_pause("you get lost in the dark.")
            print_pause("game over.")
            game_over()
    elif choice == '3':
        stay_put()
    else:
        print_pause("\nthat's not a valid choice. try again.")
        play_game()

if __name__ == "__main__":
    play_game()
