import re

def is_palindrome(text: str) -> bool:
    """
    Checks if a string is a palindrome, ignoring case, spaces, and punctuation.
    """
    # Remove non-alphanumeric characters and convert to lowercase
    clean_text = re.sub(r'[^a-zA-Z0-9]', '', text).lower()
    return clean_text == clean_text[::-1]

if __name__ == "__main__":
    user_input = input("Enter a string to check if it is a palindrome: ")
    if is_palindrome(user_input):
        print(f"'{user_input}' is a palindrome!")
    else:
        print(f"'{user_input}' is not a palindrome.")