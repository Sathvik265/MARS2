import pandas as pd

try:
    df = pd.read_excel("/Users/sathvikkemtur/Documents/rbs-branch/rbs/Documents/Restaurant_Menu_Items_2.xlsx")
    print("Columns:")
    print(df.columns.tolist())
    print("\nFirst 5 rows:")
    print(df.head(5))
except Exception as e:
    print("Error:", e)
