# SurvivorPool
An NFL rankings and Vegas odds scraper used to determine picks for the NFL Survivor Pool I am in

## What is an NFL Survivor Pool?
The general rules (lifted from [runyourpool.com](https://www.runyourpool.com/NFL-Survivor-Pools.cfm)):
- Each pool member chooses one NFL team each week.
- Picks are made "straight up", not using a point spread system.
- If their pick is correct, they survive until the next week.
- An incorrect pick eliminates the player from the pool for the remainder of the season.
- The goal is to be the the last member standing at the end of the season.

## How it works

I have a spreadsheet with the entire league schedule [here](https://docs.google.com/spreadsheets/d/1noKcC-nOzwkqcna2r-92b_69RDw4Un1WYsm6WuM3kQE/edit#gid=0). After each week, I add the previous week's picks to the column under that person's name. Based off of that value, those teams are hidden from view on the their sheet, because a player can't select a team more than once. 

When you run the update function, it makes a call to an API hosted on AWS that scrapes Vegas odds for that week's matchups, the current rankings of the NFL teams and then stores those values in the `Rankings` and `Moneyline` sheets. Once those values are updated, each user's schedule is updated as well to reflect the changes. 

Teams that are in the bottom 5 of the NFL Rankings are highlighted in red on the schedule. If a team is favored highly by Vegas to win the game (<-200), they're highlighted in green. I use this data to then decide what team I should pick for that week -- usually try to go for a high ranking team that has very good odds to win that week. As you can see here, Green Bay was highly favored to beat Arizona, which was ranked in the bottom 5 teams at the time. I picked Green Bay based off of this data and they ended up losing, eliminating me from the Survivor Pool.

![Schedule Sheet Example](/screenshot.png)
