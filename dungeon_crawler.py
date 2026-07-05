import random

def clear_screen():
    print("\n" * 100)

def display_room(room):
    print(f"\n--- {room['name']} ---")
    print(room['description'])
    if 'item' in room:
        print(f"you see a {room['item']}.")
    if 'enemies' in room:
        print(f"there are {len(room['enemies'])} {'enemy' if len(room['enemies']) == 1 else 'enemies'} here.")
    print("\nexits: " + ", ".join(room['exits'].keys()))

def get_player_command():
    print("\nwhat do you want to do?")
    command = input("> ").lower().strip()
    return command

def handle_movement(player, current_room, direction):
    if direction in current_room['exits']:
        next_room_name = current_room['exits'][direction]
        player['current_room'] = next_room_name
        return rooms[next_room_name]
    else:
        print("you can't go that way.")
        return current_room

def handle_combat(player, enemies):
    print("\ncombat!")
    for enemy in enemies:
        print(f"a {enemy['name']} appears!")
        while enemy['health'] > 0 and player['health'] > 0:
            print(f"\nyou: {player['health']}hp | {enemy['name']}: {enemy['health']}hp")
            action = input("[attack/flee] > ").lower().strip()
            if action == 'attack':
                damage = random.randint(1, player['attack'])
                enemy['health'] -= damage
                print(f"you hit the {enemy['name']} for {damage} damage.")
                if enemy['health'] > 0:
                    enemy_damage = random.randint(1, enemy['attack'])
                    player['health'] -= enemy_damage
                    print(f"the {enemy['name']} hits you for {enemy_damage} damage.")
            elif action == 'flee':
                if random.random() > 0.5:
                    print("you successfully flee!")
                    return False
                else:
                    print("you fail to flee!")
                    enemy_damage = random.randint(1, enemy['attack'])
                    player['health'] -= enemy_damage
                    print(f"the {enemy['name']} hits you for {enemy_damage} damage.")
    if player['health'] <= 0:
        print("\nyou have been defeated. game over.")
        return 'game_over'
    return True

# game data
rooms = {
    'entrance': {
        'name': 'dungeon entrance',
        'description': 'you stand at the entrance of a dark dungeon. the air is cold and damp.',
        'exits': {'north': 'hallway'},
    },
    'hallway': {
        'name': 'stone hallway',
        'description': 'a long hallway stretches before you, lit by torches.',
        'exits': {'north': 'junction', 'south': 'entrance', 'east': 'treasure_room'},
        'enemies': [{
            'name': 'goblin',
            'health': 10,
            'attack': 3,
        }],
    },
    'junction': {
        'name': 'dungeon junction',
        'description': 'you are at a junction. passages lead in all directions.',
        'exits': {'north': 'throne_room', 'south': 'hallway', 'east': 'cellar', 'west': 'library'},
    },
    'throne_room': {
        'name': 'throne room',
        'description': 'a grand room with a dusty throne. gold coins are scattered on the floor.',
        'exits': {'south': 'junction'},
        'item': 'gold coin',
    },
    'cellar': {
        'name': 'dark cellar',
        'description': 'a dark, musty cellar filled with barrels.',
        'exits': {'west': 'junction'},
        'enemies': [
            {'name': 'rat', 'health': 5, 'attack': 2},
            {'name': 'rat', 'health': 5, 'attack': 2},
        ],
    },
    'library': {
        'name': 'ancient library',
        'description': 'shelves filled with old books line the walls.',
        'exits': {'east': 'junction'},
        'item': 'ancient scroll',
    },
    'treasure_room': {
        'name': 'treasure room',
        'description': 'you\'ve found the treasure room! chests filled with gold and jewels are everywhere.',
        'exits': {'west': 'hallway'},
        'item': 'diamond',
    },
}

# player state
player = {
    'health': 20,
    'attack': 5,
    'inventory': [],
    'current_room': 'entrance',
}

# game loop
print("welcome to the dungeon crawler!")
print("type 'help' for a list of commands.")

while True:
    current_room = rooms[player['current_room']]
    display_room(current_room)

    command = get_player_command()

    if command == 'help':
        print("\ncommands:")
        print("- go [direction]")
        print("- take [item]")
        print("- look")
        print("- inventory")
        print("- quit")
    elif command == 'quit':
        print("thanks for playing!")
        break
    elif command == 'look':
        display_room(current_room)
    elif command == 'inventory':
        if player['inventory']:
            print("\nyou are carrying:")
            for item in player['inventory']:
                print(f"- {item}")
        else:
            print("\nyour inventory is empty.")
    elif command.startswith('go '):
        direction = command.split(' ')[1]
        current_room = handle_movement(player, current_room, direction)
    elif command.startswith('take '):
        item_name = command.split(' ', 1)[1]
        if 'item' in current_room and current_room['item'] == item_name:
            player['inventory'].append(item_name)
            print(f"you take the {item_name}.")
            del current_room['item']
        else:
            print(f"there is no {item_name} here.")
    else:
        print("i don't understand that command.")

    # check for combat
    if 'enemies' in current_room:
        combat_result = handle_combat(player, current_room['enemies'])
        if combat_result == 'game_over':
            break
        elif not combat_result:
            player['current_room'] = 'entrance'
            current_room = rooms[player['current_room']]

    # check win condition
    if player['current_room'] == 'treasure_room' and 'diamond' in player['inventory']:
        print("\ncongratulations! you found the treasure and won the game!")
        break

    if player['health'] <= 0:
        print("\nyou have been defeated. game over.")
        break

    input("\npress enter to continue...")
    clear_screen()
